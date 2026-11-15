import { WebGPUContext } from './webgpu.js';
import { VolumeRenderer } from './volumeRenderer.js';
import { BakePipeline, TILE_SIZE } from './bakePipeline.js';
import { SixWayPreview } from './sixWayPreview.js';
import { FluidSim } from './fluidSim.js';
import { PRESETS, CLOUD_PRESETS } from './presets.js';
import { encode16BitRGBA, triggerDownload } from './pngExporter.js';

const canvas = document.getElementById('gpu-canvas');
const gpuStatusEl = document.getElementById('gpu-status');
const validationStatusEl = document.getElementById('validation-status');
const fpsCounterEl = document.getElementById('fps-counter');
const logOutputEl = document.getElementById('log-output');
const errorBannerEl = document.getElementById('error-banner');
const lightHudEl = document.getElementById('light-hud');
const viewportHintEl = document.getElementById('viewport-hint');
const viewportTogglesEl = document.getElementById('viewport-toggles');
const progressBarEl = document.getElementById('bake-progress-bar');
const bakeStatusEl = document.getElementById('bake-status-text');

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  logOutputEl.textContent = `[${ts}] ${msg}\n` + logOutputEl.textContent;
}

function showError(msg) {
  errorBannerEl.textContent = msg;
  errorBannerEl.classList.remove('hidden');
}

// Category tabs
document.querySelectorAll('.cat-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.cat;
    document.querySelectorAll('.cat-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.cat-pane').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(targetId)?.classList.add('active');
  });
});

// View mode: 'raymarch' | 'sixway' | 'atlas', Source mode: 'fluid' | 'noise'
let viewMode = 'raymarch';
let sourceMode = 'fluid';
let isBaking = false;
let pendingPreviewDownload = false;

// Orbit camera state
const cameraState = {
  yaw: 0.65,
  pitch: 0.25,
  distance: 1.95,
  dragging: false,
  lastX: 0,
  lastY: 0,
};

// Virtual light state
const lightState = {
  azimuthDeg: 40,
  elevationDeg: 35,
  intensity: 1.35,
  absorption: 3.0,
  debugMode: 0,
  dir: [0.5, 0.57, 0.65],
};

function updateLightDir() {
  const az = (lightState.azimuthDeg * Math.PI) / 180;
  const el = (lightState.elevationDeg * Math.PI) / 180;
  const ce = Math.cos(el);
  lightState.dir = [ce * Math.sin(az), Math.sin(el), ce * Math.cos(az)];
  lightHudEl.textContent = `Light Dir: (${lightState.dir[0].toFixed(2)}, ${lightState.dir[1].toFixed(2)}, ${lightState.dir[2].toFixed(2)})`;
}
updateLightDir();

function computeCameraBasis() {
  const cp = Math.cos(cameraState.pitch);
  const sp = Math.sin(cameraState.pitch);
  const cy = Math.cos(cameraState.yaw);
  const sy = Math.sin(cameraState.yaw);

  const pos = [
    cameraState.distance * cp * sy,
    cameraState.distance * sp,
    cameraState.distance * cp * cy,
  ];
  const len = Math.hypot(pos[0], pos[1], pos[2]) || 1;
  const forward = [-pos[0] / len, -pos[1] / len, -pos[2] / len];

  const worldUp = [0, 1, 0];
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

  return { pos, forward, right, up };
}

canvas.addEventListener('pointerdown', (e) => {
  cameraState.dragging = true;
  cameraState.lastX = e.clientX;
  cameraState.lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!cameraState.dragging) return;
  const dx = e.clientX - cameraState.lastX;
  const dy = e.clientY - cameraState.lastY;
  cameraState.lastX = e.clientX;
  cameraState.lastY = e.clientY;

  if (viewMode === 'raymarch') {
    cameraState.yaw -= dx * 0.008;
    cameraState.pitch = Math.max(-1.35, Math.min(1.35, cameraState.pitch + dy * 0.008));
  } else {
    lightState.azimuthDeg = ((lightState.azimuthDeg + dx * 0.5 + 540) % 360) - 180;
    lightState.elevationDeg = Math.max(-85, Math.min(85, lightState.elevationDeg - dy * 0.5));
    const azEl = document.getElementById('light-azimuth');
    const elEl = document.getElementById('light-elevation');
    azEl.value = Math.round(lightState.azimuthDeg);
    elEl.value = Math.round(lightState.elevationDeg);
    document.getElementById('light-azimuth-val').textContent = `${azEl.value}°`;
    document.getElementById('light-elevation-val').textContent = `${elEl.value}°`;
    updateLightDir();
  }
});

canvas.addEventListener('pointerup', (e) => {
  cameraState.dragging = false;
  canvas.releasePointerCapture(e.pointerId);
});

canvas.addEventListener(
  'wheel',
  (e) => {
    if (viewMode !== 'raymarch') return;
    e.preventDefault();
    cameraState.distance = Math.max(0.7, Math.min(5.0, cameraState.distance + e.deltaY * 0.0015));
  },
  { passive: false }
);

// Render, Space & Fluid state
const params = {
  densityMult: PRESETS.smoke.densityMult,
  emissiveIntensity: PRESETS.smoke.emissiveIntensity,
  seed: 1.0,
  animating: true,
  simSpeed: 1.0,
  simSubsteps: 2,
  domainScale: 1.0,
  domainStretchY: 1.0,
  showBounds: true,
  showGrid: true,
  gridResolution: 64,
};

const fluidParams = {
  ...PRESETS.smoke,
  cloudPhysics: false,
  condensationLevel: -0.25,
  humidity: 1.15,
  latentHeat: 1.8,
  tropopauseY: 0.65,
  windShear: 0.25,
  seed: 1.0,
};
const noiseParams = { ...CLOUD_PRESETS.puffy, seed: 1.0, time: 0 };

function setSliderValue(id, value, suffix = '', decimals = null) {
  const el = document.getElementById(id);
  const valEl = document.getElementById(`${id}-val`);
  el.value = value;
  valEl.textContent = `${decimals !== null ? Number(value).toFixed(decimals) : value}${suffix}`;
}

function bindSlider(id, targetObj, key, suffix = '', decimals = null) {
  const el = document.getElementById(id);
  const valEl = document.getElementById(`${id}-val`);
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    targetObj[key] = v;
    valEl.textContent = `${decimals !== null ? v.toFixed(decimals) : el.value}${suffix}`;
    if (targetObj === lightState) {
      updateLightDir();
    }
  });
}

// Emitter & Shape sliders
bindSlider('emit-radius', fluidParams, 'radius', '', 2);
bindSlider('emit-pos-y', fluidParams, 'posY', '', 2);
bindSlider('emit-density', fluidParams, 'density', '', 2);
bindSlider('emit-temp', fluidParams, 'temp', '', 2);
bindSlider('emit-vel-y', fluidParams, 'velY', '', 2);
bindSlider('emit-radial-vel', fluidParams, 'radialVel', '', 2);
bindSlider('emit-swirl-vel', fluidParams, 'swirlVel', '', 2);

// Cloud Physics sliders
const chkCloudPhysics = document.getElementById('toggle-cloud-physics');
chkCloudPhysics.addEventListener('change', () => {
  fluidParams.cloudPhysics = chkCloudPhysics.checked;
});
bindSlider('cp-lcl', fluidParams, 'condensationLevel', '', 2);
bindSlider('cp-humidity', fluidParams, 'humidity', '', 2);
bindSlider('cp-latent', fluidParams, 'latentHeat', '', 2);
bindSlider('cp-tropo', fluidParams, 'tropopauseY', '', 2);
bindSlider('cp-shear', fluidParams, 'windShear', '', 2);

// Forces & Space sliders
bindSlider('sim-speed', params, 'simSpeed', 'x', 2);
bindSlider('domain-scale', params, 'domainScale', 'x', 2);
bindSlider('domain-stretch-y', params, 'domainStretchY', 'x', 2);
bindSlider('fluid-buoyancy', fluidParams, 'buoyancy');
bindSlider('fluid-vorticity', fluidParams, 'vorticity');
bindSlider('fluid-dissipation', fluidParams, 'densityDissipation');
bindSlider('fluid-turbulence', fluidParams, 'noiseTurbulence');

// Cloud & Fog (Procedural Noise) sliders
bindSlider('cloud-coverage', noiseParams, 'coverage', '', 2);
bindSlider('cloud-softness', noiseParams, 'softness', '', 2);
bindSlider('cloud-billow', noiseParams, 'billow', '', 2);
bindSlider('noise-scale', noiseParams, 'scale', '', 1);
bindSlider('noise-speed', noiseParams, 'speed', '', 2);
bindSlider('wind-x', noiseParams, 'windX', '', 2);
bindSlider('wind-y', noiseParams, 'windY', '', 2);
bindSlider('wind-z', noiseParams, 'windZ', '', 2);
bindSlider('cloud-core-glow', noiseParams, 'coreGlow', '', 2);

// Look & Light sliders
bindSlider('density-mult', params, 'densityMult');
bindSlider('emissive-intensity', params, 'emissiveIntensity');
bindSlider('sim-substeps', params, 'simSubsteps');
bindSlider('light-absorption', lightState, 'absorption');
bindSlider('light-intensity', lightState, 'intensity');
bindSlider('light-azimuth', lightState, 'azimuthDeg', '°');
bindSlider('light-elevation', lightState, 'elevationDeg', '°');

// Sync Bounds & Grid toggles between sidebar checkboxes and viewport HUD pills
const chkBounds = document.getElementById('toggle-bounds');
const chkGrid = document.getElementById('toggle-grid');
const hudBoundsBtn = document.getElementById('hud-bounds-btn');
const hudGridBtn = document.getElementById('hud-grid-btn');

function setShowBounds(val) {
  params.showBounds = val;
  chkBounds.checked = val;
  hudBoundsBtn.classList.toggle('active', val);
  hudBoundsBtn.textContent = `Bounds: ${val ? 'ON' : 'OFF'}`;
}

function setShowGrid(val) {
  params.showGrid = val;
  chkGrid.checked = val;
  hudGridBtn.classList.toggle('active', val);
  hudGridBtn.textContent = `Grid: ${val ? 'ON' : 'OFF'}`;
}

chkBounds.addEventListener('change', () => setShowBounds(chkBounds.checked));
chkGrid.addEventListener('change', () => setShowGrid(chkGrid.checked));
hudBoundsBtn.addEventListener('click', () => setShowBounds(!params.showBounds));
hudGridBtn.addEventListener('click', () => setShowGrid(!params.showGrid));

document.getElementById('sixway-debug').addEventListener('change', (e) => {
  lightState.debugMode = parseInt(e.target.value, 10);
});

document.getElementById('btn-regenerate').addEventListener('click', () => {
  params.seed = Math.random() * 100.0;
  fluidParams.seed = params.seed;
  noiseParams.seed = params.seed;
  log(`Regenerated seed: ${params.seed.toFixed(2)}`);
});

const toggleBtn = document.getElementById('btn-toggle-anim');
toggleBtn.addEventListener('click', () => {
  params.animating = !params.animating;
  toggleBtn.textContent = params.animating ? 'Pause' : 'Resume';
});

function setViewMode(mode) {
  viewMode = mode;
  document.getElementById('tab-raymarch').classList.toggle('active', mode === 'raymarch');
  document.getElementById('tab-sixway').classList.toggle('active', mode === 'sixway');
  document.getElementById('tab-atlas').classList.toggle('active', mode === 'atlas');
  lightHudEl.classList.toggle('hidden', mode === 'raymarch');
  viewportTogglesEl.classList.toggle('hidden', mode !== 'raymarch');
  viewportHintEl.textContent =
    mode === 'raymarch'
      ? 'Drag: Orbit Camera | Scroll: Zoom'
      : 'Drag: Move Virtual Light Direction';
}

function setSourceMode(mode) {
  sourceMode = mode;
  document.getElementById('src-fluid').classList.toggle('active', mode === 'fluid');
  document.getElementById('src-noise').classList.toggle('active', mode === 'noise');

  const emitterTabBtn = document.getElementById('cat-btn-emitter');
  const cloudTabBtn = document.getElementById('cat-btn-cloud');
  const forcesPanel = document.getElementById('fluid-forces-panel');

  const isFluid = mode === 'fluid';
  emitterTabBtn.classList.toggle('hidden', !isFluid);
  cloudTabBtn.classList.toggle('hidden', isFluid);
  forcesPanel.classList.toggle('hidden', !isFluid);

  if (isFluid && cloudTabBtn.classList.contains('active')) {
    emitterTabBtn.click();
  } else if (!isFluid && emitterTabBtn.classList.contains('active')) {
    cloudTabBtn.click();
  }
}

document.getElementById('tab-raymarch').addEventListener('click', () => setViewMode('raymarch'));
document.getElementById('tab-sixway').addEventListener('click', () => setViewMode('sixway'));
document.getElementById('tab-atlas').addEventListener('click', () => setViewMode('atlas'));
document.getElementById('src-fluid').addEventListener('click', () => setSourceMode('fluid'));
document.getElementById('src-noise').addEventListener('click', () => setSourceMode('noise'));

async function main() {
  const gpu = new WebGPUContext();
  try {
    await gpu.init(canvas, (source, message, count) => {
      validationStatusEl.textContent = `Validation Errors: ${count}`;
      validationStatusEl.className = 'badge badge-err';
      showError(`[${source}] ${message}`);
      log(`ERROR [${source}]: ${message}`);
    });

    const adapterInfo = gpu.adapter.info || {};
    const gpuName = adapterInfo.description || adapterInfo.architecture || 'WebGPU Ready';
    gpuStatusEl.textContent = `WebGPU: ${gpuName}`;
    gpuStatusEl.className = 'badge badge-ok';
    log(`WebGPU initialized (${gpuName})`);

    const volumeRenderer = new VolumeRenderer(gpu, params.gridResolution);
    await volumeRenderer.init();

    const bakePipeline = new BakePipeline(gpu);
    await bakePipeline.init();
    bakePipeline.ensureAtlasTextures(8);

    const sixWayPreview = new SixWayPreview(gpu);
    await sixWayPreview.init();

    const fluidSim = new FluidSim(gpu, params.gridResolution);
    await fluidSim.init();
    fluidSim.reset(fluidParams);

    function resetSimulation() {
      fluidParams.seed = Math.random() * 100.0;
      fluidSim.reset(fluidParams);
      log(`Simulation restarted (mode=${fluidParams.emissionMode}, shape=${fluidParams.shapeType}).`);
    }

    document.getElementById('emission-mode').addEventListener('change', (e) => {
      fluidParams.emissionMode = parseInt(e.target.value, 10);
      resetSimulation();
    });

    document.getElementById('shape-type').addEventListener('change', (e) => {
      fluidParams.shapeType = parseInt(e.target.value, 10);
      resetSimulation();
    });

    document.getElementById('grid-resolution').addEventListener('change', (e) => {
      const newSize = parseInt(e.target.value, 10);
      params.gridResolution = newSize;
      fluidSim.resize(newSize, fluidParams);
      volumeRenderer.resize(newSize);
      log(`Resized simulation grid to ${newSize}x${newSize}x${newSize}.`);
    });

    function prewarmFluid(steps = 60) {
      const encoder = gpu.device.createCommandEncoder({ label: 'FluidPrewarmEncoder' });
      for (let i = 0; i < steps; i++) {
        fluidSim.step(encoder, 1 / 60, fluidParams);
      }
      gpu.device.queue.submit([encoder.finish()]);
      log(`Grew fluid simulation by +${steps} steps.`);
    }

    document.getElementById('btn-prewarm').addEventListener('click', () => {
      prewarmFluid(60);
    });

    function applyPreset(key) {
      const p = PRESETS[key];
      if (!p) return;
      fluidParams.cloudPhysics = Boolean(p.cloudPhysics);
      Object.assign(fluidParams, p);
      params.densityMult = p.densityMult;
      params.emissiveIntensity = p.emissiveIntensity;
      lightState.absorption = p.lightAbsorption;

      chkCloudPhysics.checked = fluidParams.cloudPhysics;
      if (p.cloudPhysics) {
        setSliderValue('cp-lcl', p.condensationLevel, '', 2);
        setSliderValue('cp-humidity', p.humidity, '', 2);
        setSliderValue('cp-latent', p.latentHeat, '', 2);
        setSliderValue('cp-tropo', p.tropopauseY, '', 2);
        setSliderValue('cp-shear', p.windShear, '', 2);
      }

      document.getElementById('emission-mode').value = String(p.emissionMode);
      document.getElementById('shape-type').value = String(p.shapeType);
      setSliderValue('emit-radius', p.radius, '', 2);
      setSliderValue('emit-pos-y', p.posY, '', 2);
      setSliderValue('emit-density', p.density, '', 2);
      setSliderValue('emit-temp', p.temp, '', 2);
      setSliderValue('emit-vel-y', p.velY, '', 2);
      setSliderValue('emit-radial-vel', p.radialVel, '', 2);
      setSliderValue('emit-swirl-vel', p.swirlVel, '', 2);

      setSliderValue('fluid-buoyancy', p.buoyancy);
      setSliderValue('fluid-vorticity', p.vorticity);
      setSliderValue('fluid-dissipation', p.densityDissipation);
      setSliderValue('fluid-turbulence', p.noiseTurbulence);
      setSliderValue('density-mult', p.densityMult);
      setSliderValue('emissive-intensity', p.emissiveIntensity);
      setSliderValue('light-absorption', p.lightAbsorption);

      resetSimulation();
      if (p.prewarmSteps) {
        prewarmFluid(p.prewarmSteps);
      }
      log(`Applied preset: ${p.name}`);
    }

    document.getElementById('preset-select').addEventListener('change', (e) => {
      applyPreset(e.target.value);
    });

    function applyCloudPreset(key) {
      const c = CLOUD_PRESETS[key];
      if (!c) return;
      Object.assign(noiseParams, c);
      params.densityMult = c.densityMult;
      params.emissiveIntensity = c.emissiveIntensity;
      lightState.absorption = c.lightAbsorption;

      setSliderValue('cloud-coverage', c.coverage, '', 2);
      setSliderValue('cloud-softness', c.softness, '', 2);
      setSliderValue('cloud-billow', c.billow, '', 2);
      setSliderValue('noise-scale', c.scale, '', 1);
      setSliderValue('noise-speed', c.speed, '', 2);
      setSliderValue('wind-x', c.windX, '', 2);
      setSliderValue('wind-y', c.windY, '', 2);
      setSliderValue('wind-z', c.windZ, '', 2);
      setSliderValue('cloud-core-glow', c.coreGlow, '', 2);
      setSliderValue('density-mult', c.densityMult);
      setSliderValue('emissive-intensity', c.emissiveIntensity);
      setSliderValue('light-absorption', c.lightAbsorption);
      log(`Applied cloud preset: ${c.name}`);
    }

    document.getElementById('cloud-preset').addEventListener('change', (e) => {
      applyCloudPreset(e.target.value);
    });

    document.getElementById('btn-reset-sim').addEventListener('click', resetSimulation);

    // Still 6-Way 16-bit PNG Export
    const exportStillBtn = document.getElementById('btn-export-still');
    exportStillBtn.addEventListener('click', async () => {
      if (isBaking) return;
      isBaking = true;
      exportStillBtn.disabled = true;
      try {
        const stillSize = parseInt(document.getElementById('still-size').value, 10);
        bakeStatusEl.textContent = `Baking ${stillSize}x${stillSize} 6-way still...`;
        progressBarEl.style.width = '40%';

        const activeView = sourceMode === 'fluid' ? fluidSim.currentScalarView : volumeRenderer.volumeView;
        const activeSampler = sourceMode === 'fluid' ? fluidSim.sampler : volumeRenderer.sampler;

        const { posU16, negU16 } = await bakePipeline.bakeStillAndReadback(
          activeView,
          activeSampler,
          {
            densityMult: params.densityMult,
            emissiveIntensity: params.emissiveIntensity,
            lightAbsorption: lightState.absorption,
            domainScale: params.domainScale,
            domainStretchY: params.domainStretchY,
          },
          stillSize
        );

        progressBarEl.style.width = '85%';
        const posPng = encode16BitRGBA(stillSize, stillSize, posU16);
        const negPng = encode16BitRGBA(stillSize, stillSize, negU16);

        const posSize = triggerDownload(posPng, 'Lightmap_Pos_Still.png');
        await new Promise((r) => setTimeout(r, 200));
        const negSize = triggerDownload(negPng, 'Lightmap_Neg_Still.png');

        progressBarEl.style.width = '100%';
        const posKB = (posSize / 1024).toFixed(1);
        const negKB = (negSize / 1024).toFixed(1);
        bakeStatusEl.textContent = `Still saved: Lightmap_Pos_Still.png (${posKB} KB), Lightmap_Neg_Still.png (${negKB} KB)`;
        log(`Exported ${stillSize}x${stillSize} still 16-bit PNGs (${posKB} KB / ${negKB} KB).`);
      } catch (err) {
        bakeStatusEl.textContent = `Still export failed: ${err.message}`;
        showError(`Still export failed: ${err.message}`);
        log(`ERROR Still: ${err.message}`);
      } finally {
        isBaking = false;
        exportStillBtn.disabled = false;
      }
    });

    // Viewport Preview Screenshot PNG
    document.getElementById('btn-export-preview').addEventListener('click', () => {
      pendingPreviewDownload = true;
    });

    // Full Flipbook Bake & 16-bit PNG Export
    const bakeBtn = document.getElementById('btn-bake-export');
    bakeBtn.addEventListener('click', async () => {
      if (isBaking) return;
      isBaking = true;
      bakeBtn.disabled = true;

      try {
        const gridCols = parseInt(document.getElementById('atlas-grid').value, 10);
        const totalFrames = gridCols * gridCols;
        const atlasPx = gridCols * TILE_SIZE;
        const substeps = Math.max(1, Math.round(params.simSubsteps));

        bakePipeline.ensureAtlasTextures(gridCols);
        if (sourceMode === 'fluid') {
          fluidSim.reset(fluidParams);
        }

        let bakeTime = 0;
        const dtStep = 0.024;
        log(`Starting ${gridCols}x${gridCols} (${totalFrames} frames, ${atlasPx}x${atlasPx}) 6-way bake...`);

        await gpu.withValidationScope('Phase4.BakeAtlas', async () => {
          for (let f = 0; f < totalFrames; f++) {
            const encoder = gpu.device.createCommandEncoder({ label: `BakeFrame_${f}` });
            let activeView = volumeRenderer.volumeView;
            let activeSampler = volumeRenderer.sampler;

            if (sourceMode === 'fluid') {
              for (let s = 0; s < substeps; s++) {
                fluidSim.step(encoder, dtStep * params.simSpeed, fluidParams);
              }
              activeView = fluidSim.currentScalarView;
              activeSampler = fluidSim.sampler;
            } else {
              bakeTime += dtStep * substeps * noiseParams.speed;
              volumeRenderer.encodeNoiseCompute(encoder, {
                ...noiseParams,
                time: bakeTime,
              });
            }

            bakePipeline.encodeBakeTile(encoder, activeView, activeSampler, {
              densityMult: params.densityMult,
              emissiveIntensity: params.emissiveIntensity,
              lightAbsorption: lightState.absorption,
              domainScale: params.domainScale,
              domainStretchY: params.domainStretchY,
            });
            bakePipeline.encodeCopyTileToAtlas(encoder, f, gridCols);
            gpu.device.queue.submit([encoder.finish()]);

            const pct = Math.round(((f + 1) / totalFrames) * 80);
            progressBarEl.style.width = `${pct}%`;
            bakeStatusEl.textContent = `Baking frame ${f + 1}/${totalFrames}...`;
            await new Promise((r) => setTimeout(r, 0));
          }
        });

        setViewMode('atlas');
        bakeStatusEl.textContent = `Reading back ${atlasPx}x${atlasPx} atlases (mapAsync)...`;
        progressBarEl.style.width = '88%';

        const [posU16, negU16] = await Promise.all([
          bakePipeline.readbackAtlasU16(bakePipeline.atlasPosView, atlasPx, atlasPx),
          bakePipeline.readbackAtlasU16(bakePipeline.atlasNegView, atlasPx, atlasPx),
        ]);

        bakeStatusEl.textContent = 'Encoding 16-bit RGBA PNGs (fast-png)...';
        progressBarEl.style.width = '95%';
        await new Promise((r) => setTimeout(r, 0));

        const posPng = encode16BitRGBA(atlasPx, atlasPx, posU16);
        const negPng = encode16BitRGBA(atlasPx, atlasPx, negU16);

        const posSize = triggerDownload(posPng, 'Lightmap_Pos.png');
        await new Promise((r) => setTimeout(r, 250));
        const negSize = triggerDownload(negPng, 'Lightmap_Neg.png');

        progressBarEl.style.width = '100%';
        const posKB = (posSize / 1024).toFixed(1);
        const negKB = (negSize / 1024).toFixed(1);
        bakeStatusEl.textContent = `Done! Lightmap_Pos.png (${posKB} KB), Lightmap_Neg.png (${negKB} KB)`;
        log(`Exported 16-bit PNGs: Lightmap_Pos.png (${posKB} KB), Lightmap_Neg.png (${negKB} KB)`);
      } catch (err) {
        bakeStatusEl.textContent = `Bake failed: ${err.message}`;
        showError(`Bake failed: ${err.message}`);
        log(`ERROR Bake: ${err.message}`);
      } finally {
        isBaking = false;
        bakeBtn.disabled = false;
      }
    });

    log('All pipelines initialized.');

    window.addEventListener('resize', () => gpu.configureCanvas(canvas));

    let simTime = 0;
    let simAccumulator = 0;
    const FIXED_DT = 1 / 60;
    let lastTime = performance.now();
    let frameCount = 0;
    let fpsTimer = 0;
    let validatedCombinations = new Set();

    async function frame(now) {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (!isBaking) {
        if (params.animating) {
          simTime += dt * noiseParams.speed;
          if (sourceMode === 'fluid' && viewMode !== 'atlas') {
            simAccumulator += dt * params.simSpeed;
          }
        }

        frameCount++;
        fpsTimer += dt;
        if (fpsTimer >= 0.5) {
          fpsCounterEl.textContent = `${Math.round(frameCount / fpsTimer)} FPS`;
          frameCount = 0;
          fpsTimer = 0;
        }

        gpu.configureCanvas(canvas);
        const camera = computeCameraBasis();

        const submitFrame = () => {
          const encoder = gpu.device.createCommandEncoder({ label: 'FrameEncoder' });

          let activeVolumeView = volumeRenderer.volumeView;
          let activeSampler = volumeRenderer.sampler;

          if (viewMode !== 'atlas') {
            if (sourceMode === 'fluid') {
              if (params.animating) {
                let steps = 0;
                while (simAccumulator >= FIXED_DT && steps < 4) {
                  fluidSim.step(encoder, FIXED_DT, fluidParams);
                  simAccumulator -= FIXED_DT;
                  steps++;
                }
                if (simAccumulator > FIXED_DT * 4) {
                  simAccumulator = 0;
                }
              }
              activeVolumeView = fluidSim.currentScalarView;
              activeSampler = fluidSim.sampler;
            } else {
              volumeRenderer.encodeNoiseCompute(encoder, {
                ...noiseParams,
                time: simTime,
              });
            }
          }

          const targetView = gpu.context.getCurrentTexture().createView();
          if (viewMode === 'raymarch') {
            volumeRenderer.encodeRaymarchRender(
              encoder,
              targetView,
              canvas.width,
              canvas.height,
              camera,
              params,
              activeVolumeView
            );
          } else if (viewMode === 'sixway') {
            bakePipeline.encodeBakeTile(encoder, activeVolumeView, activeSampler, {
              densityMult: params.densityMult,
              emissiveIntensity: params.emissiveIntensity,
              lightAbsorption: lightState.absorption,
              domainScale: params.domainScale,
              domainStretchY: params.domainStretchY,
            });
            sixWayPreview.encodeRender(
              encoder,
              targetView,
              canvas.width,
              canvas.height,
              bakePipeline.posTileView,
              bakePipeline.negTileView,
              {
                dir: lightState.dir,
                intensity: lightState.intensity,
                emissiveIntensity: params.emissiveIntensity,
                debugMode: lightState.debugMode,
              }
            );
          } else {
            sixWayPreview.encodeRender(
              encoder,
              targetView,
              canvas.width,
              canvas.height,
              bakePipeline.atlasPosView,
              bakePipeline.atlasNegView,
              {
                dir: lightState.dir,
                intensity: lightState.intensity,
                emissiveIntensity: params.emissiveIntensity,
                debugMode: lightState.debugMode,
              }
            );
          }
          gpu.device.queue.submit([encoder.finish()]);

          if (pendingPreviewDownload) {
            pendingPreviewDownload = false;
            canvas.toBlob((blob) => {
              if (!blob) return;
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'Preview_Still.png';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(url), 5000);
              const kb = (blob.size / 1024).toFixed(1);
              bakeStatusEl.textContent = `Preview saved: Preview_Still.png (${kb} KB)`;
              log(`Saved viewport preview PNG (${kb} KB).`);
            }, 'image/png');
          }
        };

        const comboKey = `${sourceMode}:${viewMode}:${params.gridResolution}`;
        if (!validatedCombinations.has(comboKey)) {
          validatedCombinations.add(comboKey);
          await gpu.withValidationScope(`FirstFrame:${comboKey}`, async () => {
            submitFrame();
          });
          log(`Combo "${comboKey}" first frame validated with 0 errors.`);
        } else {
          submitFrame();
        }
      }

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  } catch (err) {
    gpuStatusEl.textContent = 'WebGPU Unavailable';
    gpuStatusEl.className = 'badge badge-err';
    showError(err.message);
    log(`FATAL: ${err.message}`);
  }
}

main();
