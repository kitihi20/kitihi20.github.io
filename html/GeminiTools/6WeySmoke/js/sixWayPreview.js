export class SixWayPreview {
  constructor(gpu) {
    this.gpu = gpu;
    this.device = gpu.device;
    this.pipeline = null;
    this.uniformBuffer = null;
    this.sampler = null;
    this.bgl = null;
  }

  async init() {
    await this.gpu.withValidationScope('SixWayPreview.init', async () => {
      const device = this.device;
      const module = await this.gpu.loadShader('shaders/sixway_preview.wgsl', 'sixway_preview');

      this.uniformBuffer = device.createBuffer({
        label: 'SixWayUniformBuffer',
        size: 4 * 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      this.sampler = device.createSampler({
        label: 'SixWaySampler',
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      });

      this.bgl = device.createBindGroupLayout({
        label: 'SixWayBGL',
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        ],
      });

      this.pipeline = device.createRenderPipeline({
        label: 'SixWayRenderPipeline',
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.bgl] }),
        vertex: { module, entryPoint: 'vs_main' },
        fragment: {
          module,
          entryPoint: 'fs_main',
          targets: [{ format: this.gpu.format }],
        },
        primitive: { topology: 'triangle-list' },
      });
    });
  }

  encodeRender(encoder, targetView, width, height, posView, negView, lightState) {
    const aspect = width / Math.max(1, height);
    const data = new Float32Array(16);
    data.set([lightState.dir[0], lightState.dir[1], lightState.dir[2], 0], 0);
    data.set([1.0, 0.94, 0.85, lightState.intensity], 4);
    data.set([0.16, 0.20, 0.27, lightState.emissiveIntensity], 8);
    data.set([aspect, lightState.debugMode, 0, 0], 12);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, data);

    const bindGroup = this.device.createBindGroup({
      label: 'SixWayBindGroup',
      layout: this.bgl,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: posView },
        { binding: 2, resource: negView },
        { binding: 3, resource: this.sampler },
      ],
    });

    const pass = encoder.beginRenderPass({
      label: 'SixWayPreviewPass',
      colorAttachments: [
        {
          view: targetView,
          clearValue: { r: 0.05, g: 0.06, b: 0.09, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }
}
