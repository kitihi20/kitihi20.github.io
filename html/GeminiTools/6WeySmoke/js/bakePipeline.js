export const TILE_SIZE = 256;

export function computeBakeBasis(azimuthDeg, elevationDeg) {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const ce = Math.cos(el);
  // Camera sits at (ce*sin(az), sin(el), ce*cos(az)) looking toward origin
  const forward = [-ce * Math.sin(az), -Math.sin(el), -ce * Math.cos(az)];
  const worldUp = Math.abs(elevationDeg) > 88 ? [0, 0, elevationDeg > 0 ? -1 : 1] : [0, 1, 0];

  let right = [
    forward[1] * worldUp[2] - forward[2] * worldUp[1],
    forward[2] * worldUp[0] - forward[0] * worldUp[2],
    forward[0] * worldUp[1] - forward[1] * worldUp[0],
  ];
  const rLen = Math.hypot(right[0], right[1], right[2]) || 1;
  right = [right[0] / rLen, right[1] / rLen, right[2] / rLen];

  const up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  return { forward, right, up };
}

export class BakePipeline {
  constructor(gpu) {
    this.gpu = gpu;
    this.device = gpu.device;
    this.posTileTex = null;
    this.negTileTex = null;
    this.posTileView = null;
    this.negTileView = null;
    this.pipeline = null;
    this.uniformBuffer = null;
    this.bgl = null;

    this.packPipeline = null;
    this.packBGL = null;
    this.packUniformBuffer = null;

    this.atlasPosTex = null;
    this.atlasNegTex = null;
    this.atlasPosView = null;
    this.atlasNegView = null;
    this.atlasSize = 0;
  }

  async init() {
    await this.gpu.withValidationScope('BakePipeline.init', async () => {
      const device = this.device;

      const texDesc = {
        size: [TILE_SIZE, TILE_SIZE, 1],
        format: 'rgba16float',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_SRC,
      };

      this.posTileTex = device.createTexture({ ...texDesc, label: 'BakePosTile' });
      this.negTileTex = device.createTexture({ ...texDesc, label: 'BakeNegTile' });
      this.posTileView = this.posTileTex.createView();
      this.negTileView = this.negTileTex.createView();

      const module = await this.gpu.loadShader('shaders/bake6way.wgsl', 'bake6way');

      this.uniformBuffer = device.createBuffer({
        label: 'BakeUniformBuffer',
        size: 5 * 16, // 80 bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      this.bgl = device.createBindGroupLayout({
        label: 'BakeBGL',
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            texture: { sampleType: 'float', viewDimension: '3d' },
          },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, sampler: { type: 'filtering' } },
          {
            binding: 3,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '2d' },
          },
          {
            binding: 4,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '2d' },
          },
        ],
      });

      this.pipeline = device.createComputePipeline({
        label: 'Bake6WayPipeline',
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.bgl] }),
        compute: { module, entryPoint: 'main' },
      });

      const packModule = await this.gpu.loadShader('shaders/pack_u16.wgsl', 'pack_u16');
      this.packUniformBuffer = device.createBuffer({
        label: 'PackU16UniformBuffer',
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      this.packBGL = device.createBindGroupLayout({
        label: 'PackU16BGL',
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            texture: { sampleType: 'float', viewDimension: '2d' },
          },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        ],
      });

      this.packPipeline = device.createComputePipeline({
        label: 'PackU16Pipeline',
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.packBGL] }),
        compute: { module: packModule, entryPoint: 'main' },
      });
    });
  }

  ensureAtlasTextures(gridCols) {
    const size = gridCols * TILE_SIZE;
    if (this.atlasSize === size && this.atlasPosTex && this.atlasNegTex) {
      return;
    }
    this.atlasPosTex?.destroy();
    this.atlasNegTex?.destroy();

    const desc = {
      size: [size, size, 1],
      format: 'rgba16float',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC,
    };
    this.atlasPosTex = this.device.createTexture({ ...desc, label: 'AtlasPosTex' });
    this.atlasNegTex = this.device.createTexture({ ...desc, label: 'AtlasNegTex' });
    this.atlasPosView = this.atlasPosTex.createView();
    this.atlasNegView = this.atlasNegTex.createView();
    this.atlasSize = size;
  }

  encodeBakeTile(
    encoder,
    volumeView,
    volumeSampler,
    {
      densityMult,
      emissiveIntensity,
      lightAbsorption,
      spaceX = 1.0,
      spaceY = 1.0,
      spaceZ = 1.0,
      bakeAzimuth = 0,
      bakeElevation = 0,
    },
    targetPosView = this.posTileView,
    targetNegView = this.negTileView,
    tileSize = TILE_SIZE
  ) {
    const basis = computeBakeBasis(bakeAzimuth, bakeElevation);
    const data = new Float32Array(20);
    data.set([basis.forward[0], basis.forward[1], basis.forward[2], 0], 0);
    data.set([basis.right[0], basis.right[1], basis.right[2], 0], 4);
    data.set([basis.up[0], basis.up[1], basis.up[2], 0], 8);
    data.set([spaceX, spaceY, spaceZ, 0], 12);
    data.set([tileSize, densityMult, emissiveIntensity, lightAbsorption], 16);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, data);

    const bindGroup = this.device.createBindGroup({
      label: 'BakeBindGroup',
      layout: this.bgl,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: volumeView },
        { binding: 2, resource: volumeSampler },
        { binding: 3, resource: targetPosView },
        { binding: 4, resource: targetNegView },
      ],
    });

    const pass = encoder.beginComputePass({ label: 'Bake6WayPass' });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    const wg = Math.ceil(tileSize / 8);
    pass.dispatchWorkgroups(wg, wg, 1);
    pass.end();
  }

  async bakeStillAndReadback(volumeView, volumeSampler, bakeParams, stillSize = 512) {
    return this.gpu.withValidationScope('BakePipeline.bakeStillAndReadback', async () => {
      const desc = {
        size: [stillSize, stillSize, 1],
        format: 'rgba16float',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_SRC,
      };
      const posTex = this.device.createTexture({ ...desc, label: 'StillPosTex' });
      const negTex = this.device.createTexture({ ...desc, label: 'StillNegTex' });
      const posView = posTex.createView();
      const negView = negTex.createView();

      const encoder = this.device.createCommandEncoder({ label: 'BakeStillEncoder' });
      this.encodeBakeTile(encoder, volumeView, volumeSampler, bakeParams, posView, negView, stillSize);
      this.device.queue.submit([encoder.finish()]);

      const [posU16, negU16] = await Promise.all([
        this.readbackAtlasU16(posView, stillSize, stillSize),
        this.readbackAtlasU16(negView, stillSize, stillSize),
      ]);

      posTex.destroy();
      negTex.destroy();
      return { posU16, negU16 };
    });
  }

  encodeCopyTileToAtlas(encoder, frameIndex, gridCols) {
    const col = frameIndex % gridCols;
    const row = Math.floor(frameIndex / gridCols);
    const origin = { x: col * TILE_SIZE, y: row * TILE_SIZE, z: 0 };

    encoder.copyTextureToTexture(
      { texture: this.posTileTex },
      { texture: this.atlasPosTex, origin },
      [TILE_SIZE, TILE_SIZE, 1]
    );
    encoder.copyTextureToTexture(
      { texture: this.negTileTex },
      { texture: this.atlasNegTex, origin },
      [TILE_SIZE, TILE_SIZE, 1]
    );
  }

  async readbackAtlasU16(atlasView, width, height) {
    return this.gpu.withValidationScope('BakePipeline.readbackAtlasU16', async () => {
      const device = this.device;
      const byteSize = width * height * 4 * 2;

      device.queue.writeBuffer(
        this.packUniformBuffer,
        0,
        new Uint32Array([width, height, 0, 0])
      );

      const storageBuf = device.createBuffer({
        label: 'PackU16StorageBuf',
        size: byteSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });

      const stagingBuf = device.createBuffer({
        label: 'PackU16StagingBuf',
        size: byteSize,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });

      const bg = device.createBindGroup({
        layout: this.packBGL,
        entries: [
          { binding: 0, resource: { buffer: this.packUniformBuffer } },
          { binding: 1, resource: atlasView },
          { binding: 2, resource: { buffer: storageBuf } },
        ],
      });

      const encoder = device.createCommandEncoder({ label: 'ReadbackAtlasEncoder' });
      const pass = encoder.beginComputePass({ label: 'PackU16Pass' });
      pass.setPipeline(this.packPipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8), 1);
      pass.end();

      encoder.copyBufferToBuffer(storageBuf, 0, stagingBuf, 0, byteSize);
      device.queue.submit([encoder.finish()]);

      await stagingBuf.mapAsync(GPUMapMode.READ);
      const copy = new Uint16Array(stagingBuf.getMappedRange()).slice();
      stagingBuf.unmap();

      storageBuf.destroy();
      stagingBuf.destroy();
      return copy;
    });
  }
}
