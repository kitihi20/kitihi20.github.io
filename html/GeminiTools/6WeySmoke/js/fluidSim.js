export class FluidSim {
  constructor(gpu, gridSize = 64) {
    this.gpu = gpu;
    this.device = gpu.device;
    this.gridSize = gridSize;
    this.simAge = 0;
    this.time = 0;

    this.textures = {};
    this.views = {};
    this.sampler = null;

    this.pipelines = {};
    this.uniforms = {};
    this.bgls = {};
    this.initBindGroup = null;
  }

  createTextures() {
    for (const tex of Object.values(this.textures)) {
      tex?.destroy();
    }
    this.textures = {};
    this.views = {};

    const createVolTex = (label) =>
      this.device.createTexture({
        label,
        size: [this.gridSize, this.gridSize, this.gridSize],
        dimension: '3d',
        format: 'rgba16float',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.COPY_SRC,
      });

    for (const name of ['velA', 'velB', 'scalarA', 'scalarB', 'curl', 'div', 'pressureA', 'pressureB']) {
      this.textures[name] = createVolTex(`Fluid_${name}_${this.gridSize}`);
      this.views[name] = this.textures[name].createView({ dimension: '3d' });
    }

    this.device.queue.writeBuffer(this.uniforms.grid, 0, new Uint32Array([this.gridSize, 0, 0, 0]));

    this.initBindGroup = this.device.createBindGroup({
      layout: this.bgls.init,
      entries: [
        { binding: 0, resource: { buffer: this.uniforms.init } },
        { binding: 1, resource: this.views.velA },
        { binding: 2, resource: this.views.scalarA },
        { binding: 3, resource: this.views.pressureA },
        { binding: 4, resource: this.views.pressureB },
      ],
    });
  }

  resize(newSize, fluidParams) {
    if (this.gridSize === newSize) return;
    this.gridSize = newSize;
    this.createTextures();
    this.reset(fluidParams);
  }

  async init() {
    await this.gpu.withValidationScope('FluidSim.init', async () => {
      const device = this.device;

      this.sampler = device.createSampler({
        label: 'FluidLinearSampler',
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
      });

      const [initMod, advectMod, forcesMod, cloudMod, vortMod, divMod, jacobiMod, projMod] = await Promise.all([
        this.gpu.loadShader('shaders/fluid_init.wgsl', 'fluid_init'),
        this.gpu.loadShader('shaders/fluid_advect.wgsl', 'fluid_advect'),
        this.gpu.loadShader('shaders/fluid_forces.wgsl', 'fluid_forces'),
        this.gpu.loadShader('shaders/fluid_cloud.wgsl', 'fluid_cloud'),
        this.gpu.loadShader('shaders/fluid_vorticity.wgsl', 'fluid_vorticity'),
        this.gpu.loadShader('shaders/fluid_divergence.wgsl', 'fluid_divergence'),
        this.gpu.loadShader('shaders/fluid_jacobi.wgsl', 'fluid_jacobi'),
        this.gpu.loadShader('shaders/fluid_project.wgsl', 'fluid_project'),
      ]);

      const storage3d = { access: 'write-only', format: 'rgba16float', viewDimension: '3d' };
      const tex3d = { sampleType: 'float', viewDimension: '3d' };

      // Uniform buffers
      this.uniforms.init = device.createBuffer({
        size: 48,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.uniforms.advect = device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.uniforms.forces = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.uniforms.cloud = device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.uniforms.vort = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.uniforms.grid = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      // 0. Init
      this.bgls.init = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: storage3d },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: storage3d },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: storage3d },
          { binding: 4, visibility: GPUShaderStage.COMPUTE, storageTexture: storage3d },
        ],
      });
      this.pipelines.init = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.bgls.init] }),
        compute: { module: initMod, entryPoint: 'main' },
      });

      // 1. Advect
      this.bgls.advect = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: tex3d },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: tex3d },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, sampler: { type: 'filtering' } },
          { binding: 4, visibility: GPUShaderStage.COMPUTE, storageTexture: storage3d },
          { binding: 5, visibility: GPUShaderStage.COMPUTE, storageTexture: storage3d },
        ],
      });
      this.pipelines.advect = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.bgls.advect] }),
        compute: { module: advectMod, entryPoint: 'main' },
      });

      // 2. Forces
      this.bgls.forces = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: tex3d },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: tex3d },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: storage3d },
          { binding: 4, visibility: GPUShaderStage.COMPUTE, storageTexture: storage3d },
        ],
      });
      this.pipelines.forces = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.bgls.forces] }),
        compute: { module: forcesMod, entryPoint: 'main' },
      });

      this.pipelines.cloud = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.bgls.forces] }),
        compute: { module: cloudMod, entryPoint: 'main' },
      });

      // 3. Vorticity
      this.bgls.vort = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: tex3d },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: tex3d },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: storage3d },
        ],
      });
      const vortLayout = device.createPipelineLayout({ bindGroupLayouts: [this.bgls.vort] });
      this.pipelines.curl = device.createComputePipeline({
        layout: vortLayout,
        compute: { module: vortMod, entryPoint: 'compute_curl' },
      });
      this.pipelines.confinement = device.createComputePipeline({
        layout: vortLayout,
        compute: { module: vortMod, entryPoint: 'apply_confinement' },
      });

      // 4. Divergence
      this.bgls.div = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: tex3d },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: storage3d },
        ],
      });
      this.pipelines.div = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.bgls.div] }),
        compute: { module: divMod, entryPoint: 'main' },
      });

      // 5. Jacobi & 6. Project
      this.bgls.grid2in1out = this.bgls.vort;
      const g2Layout = device.createPipelineLayout({ bindGroupLayouts: [this.bgls.grid2in1out] });
      this.pipelines.jacobi = device.createComputePipeline({
        layout: g2Layout,
        compute: { module: jacobiMod, entryPoint: 'main' },
      });
      this.pipelines.project = device.createComputePipeline({
        layout: g2Layout,
        compute: { module: projMod, entryPoint: 'main' },
      });

      this.createTextures();
    });
  }

  reset(fluidParams) {
    this.simAge = 0;
    const p = fluidParams || {};
    const buf = new ArrayBuffer(48);
    const u32 = new Uint32Array(buf);
    const f32 = new Float32Array(buf);
    u32[0] = this.gridSize;
    u32[1] = p.shapeType ?? 0;
    u32[2] = p.emissionMode ?? 1;
    f32[3] = p.seed ?? 1.0;
    f32[4] = p.radius ?? 0.25;
    f32[5] = p.posY ?? -0.5;
    f32[6] = p.density ?? 1.3;
    f32[7] = p.temp ?? 0.6;
    f32[8] = p.velY ?? 0.35;
    f32[9] = p.radialVel ?? 0.1;
    f32[10] = p.swirlVel ?? 0.0;
    f32[11] = 0;

    this.device.queue.writeBuffer(this.uniforms.init, 0, buf);

    const encoder = this.device.createCommandEncoder({ label: 'FluidInitEncoder' });
    const pass = encoder.beginComputePass({ label: 'FluidInitPass' });
    pass.setPipeline(this.pipelines.init);
    pass.setBindGroup(0, this.initBindGroup);
    const wg = Math.ceil(this.gridSize / 4);
    pass.dispatchWorkgroups(wg, wg, wg);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  get currentScalarView() {
    return this.views.scalarA;
  }

  step(encoder, dt, fluidParams) {
    this.simAge += dt;
    this.time += dt;
    const wg = Math.ceil(this.gridSize / 4);

    // 1. Advect
    {
      const buf = new ArrayBuffer(32);
      new Uint32Array(buf)[0] = this.gridSize;
      const f = new Float32Array(buf);
      f[1] = dt;
      f[2] = fluidParams.velDissipation;
      f[3] = fluidParams.densityDissipation;
      f[4] = fluidParams.tempDissipation;
      this.device.queue.writeBuffer(this.uniforms.advect, 0, buf);

      const bg = this.device.createBindGroup({
        layout: this.bgls.advect,
        entries: [
          { binding: 0, resource: { buffer: this.uniforms.advect } },
          { binding: 1, resource: this.views.velA },
          { binding: 2, resource: this.views.scalarA },
          { binding: 3, resource: this.sampler },
          { binding: 4, resource: this.views.velB },
          { binding: 5, resource: this.views.scalarB },
        ],
      });
      const pass = encoder.beginComputePass({ label: 'FluidAdvect' });
      pass.setPipeline(this.pipelines.advect);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(wg, wg, wg);
      pass.end();
    }

    // 2. Forces & Emission
    {
      const buf = new ArrayBuffer(64);
      const u = new Uint32Array(buf);
      const f = new Float32Array(buf);
      u[0] = this.gridSize;
      u[1] = fluidParams.shapeType;
      u[2] = fluidParams.emissionMode;
      f[3] = dt;
      f[4] = this.time;
      f[5] = fluidParams.buoyancy;
      f[6] = fluidParams.gravity;
      f[7] = fluidParams.noiseTurbulence;
      f[8] = fluidParams.radius;
      f[9] = fluidParams.posY;
      f[10] = fluidParams.density;
      f[11] = fluidParams.temp;
      f[12] = fluidParams.velY;
      f[13] = fluidParams.radialVel;
      f[14] = fluidParams.swirlVel;
      f[15] = 0;
      this.device.queue.writeBuffer(this.uniforms.forces, 0, buf);

      const bg = this.device.createBindGroup({
        layout: this.bgls.forces,
        entries: [
          { binding: 0, resource: { buffer: this.uniforms.forces } },
          { binding: 1, resource: this.views.velB },
          { binding: 2, resource: this.views.scalarB },
          { binding: 3, resource: this.views.velA },
          { binding: 4, resource: this.views.scalarA },
        ],
      });
      const pass = encoder.beginComputePass({ label: 'FluidForces' });
      pass.setPipeline(this.pipelines.forces);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(wg, wg, wg);
      pass.end();
    }

    // 2B. Physical Cloud Thermodynamics (Condensation, Latent Heat, Tropopause Inversion)
    if (fluidParams.cloudPhysics) {
      const buf = new ArrayBuffer(32);
      new Uint32Array(buf)[0] = this.gridSize;
      const f = new Float32Array(buf);
      f[1] = dt;
      f[2] = this.time;
      f[3] = fluidParams.condensationLevel ?? -0.25;
      f[4] = fluidParams.humidity ?? 1.15;
      f[5] = fluidParams.latentHeat ?? 2.0;
      f[6] = fluidParams.tropopauseY ?? 0.65;
      f[7] = fluidParams.windShear ?? 0.35;
      this.device.queue.writeBuffer(this.uniforms.cloud, 0, buf);

      const bg = this.device.createBindGroup({
        layout: this.bgls.forces,
        entries: [
          { binding: 0, resource: { buffer: this.uniforms.cloud } },
          { binding: 1, resource: this.views.velA },
          { binding: 2, resource: this.views.scalarA },
          { binding: 3, resource: this.views.velB },
          { binding: 4, resource: this.views.scalarB },
        ],
      });
      const pass = encoder.beginComputePass({ label: 'FluidCloudPhysics' });
      pass.setPipeline(this.pipelines.cloud);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(wg, wg, wg);
      pass.end();

      const volSize = [this.gridSize, this.gridSize, this.gridSize];
      encoder.copyTextureToTexture({ texture: this.textures.velB }, { texture: this.textures.velA }, volSize);
      encoder.copyTextureToTexture({ texture: this.textures.scalarB }, { texture: this.textures.scalarA }, volSize);
    }

    // 3. Vorticity Confinement
    {
      const buf = new ArrayBuffer(16);
      new Uint32Array(buf)[0] = this.gridSize;
      const f = new Float32Array(buf);
      f[1] = dt;
      f[2] = fluidParams.vorticity;
      this.device.queue.writeBuffer(this.uniforms.vort, 0, buf);

      const curlBG = this.device.createBindGroup({
        layout: this.bgls.vort,
        entries: [
          { binding: 0, resource: { buffer: this.uniforms.vort } },
          { binding: 1, resource: this.views.velA },
          { binding: 2, resource: this.views.velA },
          { binding: 3, resource: this.views.curl },
        ],
      });
      const confBG = this.device.createBindGroup({
        layout: this.bgls.vort,
        entries: [
          { binding: 0, resource: { buffer: this.uniforms.vort } },
          { binding: 1, resource: this.views.velA },
          { binding: 2, resource: this.views.curl },
          { binding: 3, resource: this.views.velB },
        ],
      });

      const pass = encoder.beginComputePass({ label: 'FluidVorticity' });
      pass.setPipeline(this.pipelines.curl);
      pass.setBindGroup(0, curlBG);
      pass.dispatchWorkgroups(wg, wg, wg);
      pass.setPipeline(this.pipelines.confinement);
      pass.setBindGroup(0, confBG);
      pass.dispatchWorkgroups(wg, wg, wg);
      pass.end();
    }

    // 4. Divergence
    {
      const bg = this.device.createBindGroup({
        layout: this.bgls.div,
        entries: [
          { binding: 0, resource: { buffer: this.uniforms.grid } },
          { binding: 1, resource: this.views.velB },
          { binding: 2, resource: this.views.div },
        ],
      });
      const pass = encoder.beginComputePass({ label: 'FluidDivergence' });
      pass.setPipeline(this.pipelines.div);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(wg, wg, wg);
      pass.end();
    }

    // 5. Pressure Jacobi
    {
      const bgAB = this.device.createBindGroup({
        layout: this.bgls.grid2in1out,
        entries: [
          { binding: 0, resource: { buffer: this.uniforms.grid } },
          { binding: 1, resource: this.views.pressureA },
          { binding: 2, resource: this.views.div },
          { binding: 3, resource: this.views.pressureB },
        ],
      });
      const bgBA = this.device.createBindGroup({
        layout: this.bgls.grid2in1out,
        entries: [
          { binding: 0, resource: { buffer: this.uniforms.grid } },
          { binding: 1, resource: this.views.pressureB },
          { binding: 2, resource: this.views.div },
          { binding: 3, resource: this.views.pressureA },
        ],
      });

      const pass = encoder.beginComputePass({ label: 'FluidJacobi' });
      pass.setPipeline(this.pipelines.jacobi);
      for (let i = 0; i < 16; i++) {
        pass.setBindGroup(0, i % 2 === 0 ? bgAB : bgBA);
        pass.dispatchWorkgroups(wg, wg, wg);
      }
      pass.end();
    }

    // 6. Projection
    {
      const bg = this.device.createBindGroup({
        layout: this.bgls.grid2in1out,
        entries: [
          { binding: 0, resource: { buffer: this.uniforms.grid } },
          { binding: 1, resource: this.views.velB },
          { binding: 2, resource: this.views.pressureA },
          { binding: 3, resource: this.views.velA },
        ],
      });
      const pass = encoder.beginComputePass({ label: 'FluidProject' });
      pass.setPipeline(this.pipelines.project);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(wg, wg, wg);
      pass.end();
    }
  }
}
