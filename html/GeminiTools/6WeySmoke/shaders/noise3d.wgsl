struct NoiseParams {
  gridSize: vec3<u32>,
  cloudType: u32, // 0=Puffy, 1=ToweringCumulus, 2=Cumulonimbus, 3=Cirrus, 4=FogLayer
  time: f32,
  seed: f32,
  scale: f32,
  coverage: f32,
  softness: f32,
  billow: f32,
  windX: f32,
  windY: f32,
  windZ: f32,
  coreGlow: f32,
  spaceX: f32,
  spaceY: f32,
  spaceZ: f32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
};

@group(0) @binding(0) var<uniform> params: NoiseParams;
@group(0) @binding(1) var outVolume: texture_storage_3d<rgba16float, write>;

fn hash33(p: vec3<f32>) -> vec3<f32> {
  var q = vec3<f32>(
    dot(p, vec3<f32>(127.1, 311.7, 74.7)),
    dot(p, vec3<f32>(269.5, 183.3, 246.1)),
    dot(p, vec3<f32>(113.5, 271.9, 124.6))
  );
  return fract(sin(q) * 43758.5453123);
}

fn gradientNoise3D(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);

  let n000 = dot(hash33(i + vec3<f32>(0.0, 0.0, 0.0)) * 2.0 - 1.0, f - vec3<f32>(0.0, 0.0, 0.0));
  let n100 = dot(hash33(i + vec3<f32>(1.0, 0.0, 0.0)) * 2.0 - 1.0, f - vec3<f32>(1.0, 0.0, 0.0));
  let n010 = dot(hash33(i + vec3<f32>(0.0, 1.0, 0.0)) * 2.0 - 1.0, f - vec3<f32>(0.0, 1.0, 0.0));
  let n110 = dot(hash33(i + vec3<f32>(1.0, 1.0, 0.0)) * 2.0 - 1.0, f - vec3<f32>(1.0, 1.0, 0.0));
  let n001 = dot(hash33(i + vec3<f32>(0.0, 0.0, 1.0)) * 2.0 - 1.0, f - vec3<f32>(0.0, 0.0, 1.0));
  let n101 = dot(hash33(i + vec3<f32>(1.0, 0.0, 1.0)) * 2.0 - 1.0, f - vec3<f32>(1.0, 0.0, 1.0));
  let n011 = dot(hash33(i + vec3<f32>(0.0, 1.0, 1.0)) * 2.0 - 1.0, f - vec3<f32>(0.0, 1.0, 1.0));
  let n111 = dot(hash33(i + vec3<f32>(1.0, 1.0, 1.0)) * 2.0 - 1.0, f - vec3<f32>(1.0, 1.0, 1.0));

  let nx00 = mix(n000, n100, u.x);
  let nx10 = mix(n010, n110, u.x);
  let nx01 = mix(n001, n101, u.x);
  let nx11 = mix(n011, n111, u.x);

  let nxy0 = mix(nx00, nx10, u.y);
  let nxy1 = mix(nx01, nx11, u.y);

  return mix(nxy0, nxy1, u.z);
}

fn perlinFbm(p: vec3<f32>) -> f32 {
  var value = 0.0;
  var amp = 0.5;
  var freq = 1.0;
  for (var i = 0; i < 4; i = i + 1) {
    value += amp * gradientNoise3D(p * freq);
    freq *= 2.07;
    amp *= 0.5;
  }
  return value * 0.5 + 0.5;
}

fn worley3D(p: vec3<f32>) -> f32 {
  let id = floor(p);
  let f = fract(p);
  var minDistSq = 1.6;

  for (var z = -1; z <= 1; z = z + 1) {
    for (var y = -1; y <= 1; y = y + 1) {
      for (var x = -1; x <= 1; x = x + 1) {
        let neighbor = vec3<f32>(f32(x), f32(y), f32(z));
        let pt = hash33(id + neighbor);
        let diff = neighbor + pt - f;
        minDistSq = min(minDistSq, dot(diff, diff));
      }
    }
  }
  return clamp(1.0 - sqrt(minDistSq), 0.0, 1.0);
}

fn worleyFbm4(p: vec3<f32>) -> f32 {
  let w0 = worley3D(p);
  let w1 = worley3D(p * 2.13 + vec3<f32>(5.2, 1.3, 8.7));
  let w2 = worley3D(p * 4.31 + vec3<f32>(2.8, 9.1, 3.4));
  let w3 = worley3D(p * 8.63 + vec3<f32>(7.4, 4.2, 6.1));
  return w0 * 0.48 + w1 * 0.26 + w2 * 0.16 + w3 * 0.10;
}

fn remap(val: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
  let t = clamp((val - inMin) / max(inMax - inMin, 1e-4), 0.0, 1.0);
  return mix(outMin, outMax, t);
}

fn evalCloudEnvelope(wp: vec3<f32>, centered: vec3<f32>, cloudType: u32) -> f32 {
  if (cloudType == 0u) {
    let baseCut = smoothstep(-0.46, -0.22, centered.y);
    let topFade = smoothstep(0.88, 0.35, centered.y);
    let radial = length(wp * vec3<f32>(0.95, 1.35, 0.95) - vec3<f32>(0.0, -0.05, 0.0));
    return smoothstep(0.88, 0.18, radial) * baseCut * topFade;
  } else if (cloudType == 1u) {
    let hNorm = clamp((centered.y + 0.78) / 1.65, 0.0, 1.0);
    let baseCut = smoothstep(-0.82, -0.58, centered.y);
    let topFade = smoothstep(0.95, 0.65, centered.y);
    let width = mix(0.85, 0.36, pow(hNorm, 0.85));
    let tiltX = hNorm * 0.14;
    let radial = length(wp.xz - vec2<f32>(tiltX, 0.0)) / width;
    return smoothstep(1.0, 0.22, radial) * baseCut * topFade;
  } else if (cloudType == 2u) {
    let hNorm = clamp((centered.y + 0.82) / 1.72, 0.0, 1.0);
    let baseCut = smoothstep(-0.86, -0.62, centered.y);
    let topFade = smoothstep(0.96, 0.68, centered.y);
    let baseW = mix(0.88, 0.42, smoothstep(0.0, 0.55, hNorm));
    let anvilW = smoothstep(0.58, 0.92, hNorm) * 0.52;
    let width = baseW + anvilW;
    let shearX = smoothstep(0.35, 1.0, hNorm) * 0.28;
    let radial = length((wp.xz - vec2<f32>(shearX, 0.0)) * vec2<f32>(0.9, 1.15)) / width;
    return smoothstep(1.0, 0.20, radial) * baseCut * topFade;
  } else if (cloudType == 3u) {
    let yMask = smoothstep(-0.48, -0.05, centered.y) * smoothstep(0.55, 0.08, centered.y);
    let xzMask = smoothstep(0.98, 0.25, length(wp.xz * vec2<f32>(0.85, 1.2)));
    return yMask * xzMask;
  } else {
    let yMask = smoothstep(-0.95, -0.68, centered.y) * smoothstep(0.22, -0.45, centered.y);
    let xzMask = smoothstep(1.0, 0.28, length(wp.xz * 0.85));
    return yMask * xzMask;
  }
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = params.gridSize;
  if (gid.x >= n.x || gid.y >= n.y || gid.z >= n.z) {
    return;
  }

  let uvw = (vec3<f32>(gid) + 0.5) / vec3<f32>(n);
  let centered = uvw * 2.0 - 1.0;
  let space = vec3<f32>(params.spaceX, params.spaceY, params.spaceZ);

  let windOffset = vec3<f32>(params.windX, params.windY, params.windZ) * params.time;
  let seedOffset = vec3<f32>(params.seed * 7.13, params.seed * 3.71, params.seed * 11.47);

  let warpCoord = centered * space * 1.45 - windOffset * 0.35 + seedOffset * 0.3;
  let warpVec = vec3<f32>(
    perlinFbm(warpCoord + vec3<f32>(0.0, 0.0, 0.0)) - 0.5,
    perlinFbm(warpCoord + vec3<f32>(5.2, 1.3, 2.8)) - 0.5,
    perlinFbm(warpCoord + vec3<f32>(2.1, 7.4, 4.9)) - 0.5
  );
  let warpAmp = select(0.52, 0.70, params.cloudType == 3u);
  let warpedPos = centered + warpVec * warpAmp;

  let macroShape = evalCloudEnvelope(warpedPos, centered, params.cloudType);

  var noiseCoord = centered * space;
  if (params.cloudType == 3u) {
    noiseCoord = vec3<f32>(noiseCoord.x * 0.32 + noiseCoord.y * 0.95, noiseCoord.y * 2.4, noiseCoord.z * 1.3);
  } else if (params.cloudType == 4u) {
    noiseCoord = vec3<f32>(noiseCoord.x * 0.65, noiseCoord.y * 1.8, noiseCoord.z * 0.65);
  }

  let samplePos = noiseCoord * (params.scale * 1.45) - windOffset + seedOffset;
  let pFbm = perlinFbm(samplePos);
  let wFbm = worleyFbm4(samplePos * 1.25);

  let perlinWorley = remap(pFbm, 0.0, 1.0, wFbm * 0.55, 1.0);
  let baseNoise = mix(pFbm, perlinWorley, params.billow);

  let baseCloud = remap(macroShape * (0.35 + 0.95 * baseNoise), 1.0 - params.coverage, 1.0, 0.0, 1.0);

  let detailWorley = worleyFbm4(samplePos * 2.3 + warpVec * 1.4);
  let erodeStrength = select(0.45 * params.billow, 0.14, params.cloudType >= 3u);
  let eroded = remap(baseCloud, detailWorley * erodeStrength, 1.0, 0.0, 1.0);

  let density = smoothstep(0.0, max(params.softness, 0.03), eroded) * 1.6;

  let coreDist = length(warpedPos);
  let temperature = clamp(smoothstep(0.65, 0.08, coreDist) * params.coreGlow * smoothstep(0.05, 0.45, density), 0.0, 1.5);

  textureStore(outVolume, vec3<i32>(gid), vec4<f32>(density, temperature, 0.0, 1.0));
}
