export class VolumeRenderer {
  constructor(gpu, gridDims = [64, 64, 64]) {
    this.gpu = gpu;
    this.device = gpu.device;
    this.gridDims = [...gridDims];
    this.volumeTexture = null;
    this.volumeView = null;
    this.sampler = null;

    this.noisePipeline = null;
    this.noiseUniformBuffer = null;
    this.noiseBGL = null;
    this.noiseBindGroup = null;

    this.raymarchPipeline = null;
    this.raymarchUniformBuffer = null;
    this.raymarchBGL = null;
    this.raymarchBindGroups = new Map();
  }

  createVolumeTextures() {
    this.volumeTexture?.destroy();
    this.raymarchBindGroups.clear();

    const [gx, gy, gz] = this.gridDims;
    this.volumeTexture = this.device.createTexture({
      label: `Volume3D_${gx}x${gy}x${gz}`,
      size: [gx, gy, gz],
      dimension: '3d',
      format: 'rgba16float',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });
    this.volumeView = this.volumeTexture.createView({ dimension: '3d' });

    if (this.noiseBGL) {
      this.noiseBindGroup = this.device.createBindGroup({
        label: 'NoiseBindGroup',
        layout: this.noiseBGL,
        entries: [
          { binding: 0, resource: { buffer: this.noiseUniformBuffer } },
          { binding: 1, resource: this.volumeView },
        ],
      });
    }
  }

  resize(newDims) {
    if (
      this.gridDims[0] === newDims[0] &&
      this.gridDims[1] === newDims[1] &&
      this.gridDims[2] === newDims[2]
    ) {
      return;
    }
    this.gridDims = [...newDims];
    this.createVolumeTextures();
  }

  async init() {
    await this.gpu.withValidationScope('VolumeRenderer.init', async () => {
      const device = this.device;

      this.sampler = device.createSampler({
        label: 'VolumeSampler',
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
      });

      // 1. Noise Compute Pipeline (80 bytes = 20 scalars)
      const noiseModule = await this.gpu.loadShader('shaders/noise3d.wgsl', 'noise3d');
      this.noiseUniformBuffer = device.createBuffer({
        label: 'NoiseParamsBuffer',
        size: 80,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      this.noiseBGL = device.createBindGroupLayout({
        label: 'NoiseBGL',
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: {
              access: 'write-only',
              format: 'rgba16float',
              viewDimension: '3d',
            },
          },
        ],
      });

      this.noisePipeline = device.createComputePipeline({
        label: 'NoiseComputePipeline',
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.noiseBGL] }),
        compute: { module: noiseModule, entryPoint: 'main' },
      });

      this.createVolumeTextures();

      // 2. Raymarch Render Pipeline
      const raymarchModule = await this.gpu.loadShader('shaders/raymarch.wgsl', 'raymarch');
      this.raymarchUniformBuffer = device.createBuffer({
        label: 'RaymarchUniformBuffer',
        size: 8 * 16, // 128 bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const raymarchBGL = device.createBindGroupLayout({
        label: 'RaymarchBGL',
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: 'float', viewDimension: '3d' },
          },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        ],
      });
      this.raymarchBGL = raymarchBGL;

      this.raymarchPipeline = device.createRenderPipeline({
        label: 'RaymarchRenderPipeline',
        layout: device.createPipelineLayout({ bindGroupLayouts: [raymarchBGL] }),
        vertex: { module: raymarchModule, entryPoint: 'vs_main' },
        fragment: {
          module: raymarchModule,
          entryPoint: 'fs_main',
          targets: [{ format: this.gpu.format }],
        },
        primitive: { topology: 'triangle-list' },
      });
    });
  }

  getRaymarchBindGroup(volumeView) {
    let bg = this.raymarchBindGroups.get(volumeView);
    if (!bg) {
      bg = this.device.createBindGroup({
        label: 'RaymarchBindGroup',
        layout: this.raymarchBGL,
        entries: [
          { binding: 0, resource: { buffer: this.raymarchUniformBuffer } },
          { binding: 1, resource: volumeView },
          { binding: 2, resource: this.sampler },
        ],
      });
      this.raymarchBindGroups.set(volumeView, bg);
    }
    return bg;
  }

  encodeNoiseCompute(encoder, noiseParams, spaceSize = [1, 1, 1]) {
    const [gx, gy, gz] = this.gridDims;
    const buf = new ArrayBuffer(80);
    const u32 = new Uint32Array(buf);
    const f32 = new Float32Array(buf);
    u32[0] = gx;
    u32[1] = gy;
    u32[2] = gz;
    u32[3] = noiseParams.cloudType ?? 0;
    f32[4] = noiseParams.time ?? 0;
    f32[5] = noiseParams.seed ?? 1.0;
    f32[6] = noiseParams.scale ?? 2.6;
    f32[7] = noiseParams.coverage ?? 0.68;
    f32[8] = noiseParams.softness ?? 0.12;
    f32[9] = noiseParams.billow ?? 0.80;
    f32[10] = noiseParams.windX ?? 0.3;
    f32[11] = noiseParams.windY ?? 0.15;
    f32[12] = noiseParams.windZ ?? 0.0;
    f32[13] = noiseParams.coreGlow ?? 0.0;
    f32[14] = spaceSize[0];
    f32[15] = spaceSize[1];
    f32[16] = spaceSize[2];
    this.device.queue.writeBuffer(this.noiseUniformBuffer, 0, buf);

    const pass = encoder.beginComputePass({ label: 'Noise3DPass' });
    pass.setPipeline(this.noisePipeline);
    pass.setBindGroup(0, this.noiseBindGroup);
    pass.dispatchWorkgroups(Math.ceil(gx / 4), Math.ceil(gy / 4), Math.ceil(gz / 4));
    pass.end();
  }

  encodeRaymarchRender(encoder, targetView, width, height, camera, params, customVolumeView = null) {
    const aspect = width / Math.max(1, height);
    const fovTan = Math.tan((42 * Math.PI) / 180 / 2);

    const data = new Float32Array(32);
    data.set([camera.pos[0], camera.pos[1], camera.pos[2], 0], 0);
    data.set([camera.forward[0], camera.forward[1], camera.forward[2], 0], 4);
    data.set([camera.right[0], camera.right[1], camera.right[2], 0], 8);
    data.set([camera.up[0], camera.up[1], camera.up[2], 0], 12);
    data.set([0.6, 0.8, 0.5, 0], 16);
    data.set([aspect, fovTan, params.densityMult, params.emissiveIntensity], 20);
    const flags = (params.showBounds ? 1 : 0) | (params.showGrid ? 2 : 0);
    data.set([params.spaceX, params.spaceY, params.spaceZ, flags], 24);
    data.set([this.gridDims[0], this.gridDims[1], this.gridDims[2], params.sootDarkness ?? 0.0], 28);

    this.device.queue.writeBuffer(this.raymarchUniformBuffer, 0, data);

    const pass = encoder.beginRenderPass({
      label: 'RaymarchRenderPass',
      colorAttachments: [
        {
          view: targetView,
          clearValue: { r: 0.05, g: 0.06, b: 0.09, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(this.raymarchPipeline);
    pass.setBindGroup(0, this.getRaymarchBindGroup(customVolumeView || this.volumeView));
    pass.draw(3);
    pass.end();
  }
}
