export const VOLUME_SIZE = 64;

export class VolumeRenderer {
  constructor(gpu, gridSize = 64) {
    this.gpu = gpu;
    this.device = gpu.device;
    this.gridSize = gridSize;
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

    this.volumeTexture = this.device.createTexture({
      label: `Volume3D_${this.gridSize}`,
      size: [this.gridSize, this.gridSize, this.gridSize],
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

  resize(newSize) {
    if (this.gridSize === newSize) return;
    this.gridSize = newSize;
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

      // 1. Noise Compute Pipeline
      const noiseModule = await this.gpu.loadShader('shaders/noise3d.wgsl', 'noise3d');
      this.noiseUniformBuffer = device.createBuffer({
        label: 'NoiseParamsBuffer',
        size: 48,
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
        size: 8 * 16, // 8 vec4f = 128 bytes
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

  encodeNoiseCompute(encoder, noiseParams) {
    const buf = new ArrayBuffer(48);
    const u32 = new Uint32Array(buf);
    const f32 = new Float32Array(buf);
    u32[0] = this.gridSize;
    u32[1] = noiseParams.cloudType ?? 0;
    f32[2] = noiseParams.time ?? 0;
    f32[3] = noiseParams.seed ?? 1.0;
    f32[4] = noiseParams.scale ?? 3.2;
    f32[5] = noiseParams.coverage ?? 0.65;
    f32[6] = noiseParams.softness ?? 0.25;
    f32[7] = noiseParams.billow ?? 0.4;
    f32[8] = noiseParams.windX ?? 0.35;
    f32[9] = noiseParams.windY ?? 0.25;
    f32[10] = noiseParams.windZ ?? 0.0;
    f32[11] = noiseParams.coreGlow ?? 0.0;
    this.device.queue.writeBuffer(this.noiseUniformBuffer, 0, buf);

    const pass = encoder.beginComputePass({ label: 'Noise3DPass' });
    pass.setPipeline(this.noisePipeline);
    pass.setBindGroup(0, this.noiseBindGroup);
    const wg = Math.ceil(this.gridSize / 4);
    pass.dispatchWorkgroups(wg, wg, wg);
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
    const sx = params.domainScale ?? 1.0;
    const sy = (params.domainScale ?? 1.0) * (params.domainStretchY ?? 1.0);
    const sz = params.domainScale ?? 1.0;
    const flags = (params.showBounds ? 1 : 0) | (params.showGrid ? 2 : 0);
    data.set([sx, sy, sz, flags], 24);
    data.set([this.gridSize, 0, 0, 0], 28);

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
