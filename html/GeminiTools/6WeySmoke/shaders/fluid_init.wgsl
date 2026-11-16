struct InitUniforms {
  gridSize: vec3<u32>,
  shapeType: u32,    // 0=Sphere, 1=Column, 2=Torus, 3=GroundBox, 4=BlastFireball
  emissionMode: u32, // 0=BurstOnly, 1=Continuous, 2=Burst+Continuous
  seed: f32,
  radius: f32,
  posY: f32,
  density: f32,
  temp: f32,
  velY: f32,
  radialVel: f32,
  swirlVel: f32,
  spaceX: f32,
  spaceY: f32,
  spaceZ: f32,
};

@group(0) @binding(0) var<uniform> params: InitUniforms;
@group(0) @binding(1) var velDst: texture_storage_3d<rgba16float, write>;
@group(0) @binding(2) var scalarDst: texture_storage_3d<rgba16float, write>;
@group(0) @binding(3) var pressureADst: texture_storage_3d<rgba16float, write>;
@group(0) @binding(4) var pressureBDst: texture_storage_3d<rgba16float, write>;

fn hash3(p: vec3<f32>) -> vec3<f32> {
  let q = vec3<f32>(
    dot(p, vec3<f32>(127.1, 311.7, 74.7)),
    dot(p, vec3<f32>(269.5, 183.3, 246.1)),
    dot(p, vec3<f32>(113.5, 271.9, 124.6))
  );
  return fract(sin(q) * 43758.5453123) * 2.0 - 1.0;
}

fn noise3(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let n000 = dot(hash3(i + vec3<f32>(0.0, 0.0, 0.0)), f - vec3<f32>(0.0, 0.0, 0.0));
  let n100 = dot(hash3(i + vec3<f32>(1.0, 0.0, 0.0)), f - vec3<f32>(1.0, 0.0, 0.0));
  let n010 = dot(hash3(i + vec3<f32>(0.0, 1.0, 0.0)), f - vec3<f32>(0.0, 1.0, 0.0));
  let n110 = dot(hash3(i + vec3<f32>(1.0, 1.0, 0.0)), f - vec3<f32>(1.0, 1.0, 0.0));
  let n001 = dot(hash3(i + vec3<f32>(0.0, 0.0, 1.0)), f - vec3<f32>(0.0, 0.0, 1.0));
  let n101 = dot(hash3(i + vec3<f32>(1.0, 0.0, 1.0)), f - vec3<f32>(1.0, 0.0, 1.0));
  let n011 = dot(hash3(i + vec3<f32>(0.0, 1.0, 1.0)), f - vec3<f32>(0.0, 1.0, 1.0));
  let n111 = dot(hash3(i + vec3<f32>(1.0, 1.0, 1.0)), f - vec3<f32>(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}

fn evalShapeMask(pos: vec3<f32>, shapeType: u32, radius: f32, posY: f32, nVal: f32) -> vec2<f32> {
  // Returns vec2(densityMask, heatMask)
  let center = vec3<f32>(0.0, posY, 0.0);
  let rel = pos - center;
  let r = max(radius, 0.05);

  if (shapeType == 0u) {
    let d = length(rel);
    let m = smoothstep(r, r * 0.15, d + nVal * r * 0.25);
    return vec2<f32>(m, m);
  } else if (shapeType == 1u) {
    let radial = length(rel.xz);
    let halfH = r * 1.6;
    let yMask = smoothstep(-halfH, -halfH * 0.4, rel.y) * smoothstep(halfH, halfH * 0.4, rel.y);
    let m = smoothstep(r * 0.75, r * 0.1, radial + nVal * r * 0.2) * yMask;
    return vec2<f32>(m, m);
  } else if (shapeType == 2u) {
    let ringR = r * 0.75;
    let tubeR = max(r * 0.35, 0.06);
    let torusDist = length(vec2<f32>(length(rel.xz) - ringR, rel.y));
    let m = smoothstep(tubeR, tubeR * 0.15, torusDist + nVal * tubeR * 0.25);
    return vec2<f32>(m, m);
  } else if (shapeType == 3u) {
    let radial = length(rel.xz);
    let halfH = max(r * 0.35, 0.08);
    let yMask = smoothstep(-halfH, -halfH * 0.2, rel.y) * smoothstep(halfH, halfH * 0.2, rel.y);
    let m = smoothstep(r * 1.4, r * 0.3, radial + nVal * r * 0.2) * yMask;
    return vec2<f32>(m, m);
  } else {
    // 4: Tokusatsu Fireball + Ground Shockwave Ring
    let coreD = length(rel * vec3<f32>(1.0, 0.85, 1.0));
    let coreMask = smoothstep(r * 1.05, r * 0.15, coreD + nVal * r * 0.32);

    // Secondary ground shockwave ring
    let ringCenter = vec3<f32>(0.0, posY - r * 0.35, 0.0);
    let rRel = pos - ringCenter;
    let ringR = r * 1.35;
    let tubeR = max(r * 0.26, 0.08);
    let ringDist = length(vec2<f32>(length(rRel.xz) - ringR, rRel.y * 1.3));
    let ringMask = smoothstep(tubeR, tubeR * 0.15, ringDist + nVal * tubeR * 0.25) * 0.85;

    let dMask = max(coreMask, ringMask);
    // Core is extra hot while ground ring is cooler dusty blast
    let hMask = max(coreMask * 1.35, ringMask * 0.35);
    return vec2<f32>(dMask, hMask);
  }
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = params.gridSize;
  if (gid.x >= n.x || gid.y >= n.y || gid.z >= n.z) {
    return;
  }

  let coord = vec3<i32>(gid);
  textureStore(pressureADst, coord, vec4<f32>(0.0, 0.0, 0.0, 1.0));
  textureStore(pressureBDst, coord, vec4<f32>(0.0, 0.0, 0.0, 1.0));

  if (params.emissionMode == 1u) {
    textureStore(velDst, coord, vec4<f32>(0.0));
    textureStore(scalarDst, coord, vec4<f32>(0.0, 0.0, 0.0, 1.0));
    return;
  }

  let uvw = (vec3<f32>(gid) + 0.5) / vec3<f32>(n);
  let space = vec3<f32>(params.spaceX, params.spaceY, params.spaceZ);
  let pos = (uvw * 2.0 - 1.0) * space;
  let nVal = noise3(pos * 4.5 + vec3<f32>(params.seed * 3.1, params.seed * 1.7, params.seed * 5.3))
           + noise3(pos * 9.5 + vec3<f32>(params.seed * 7.3, 1.2, 4.9)) * 0.45;

  let scaledPosY = params.posY * params.spaceY;
  let masks = evalShapeMask(pos, params.shapeType, params.radius, scaledPosY, nVal);
  let outDensity = max(0.0, masks.x * params.density);
  let outTemp = max(0.0, masks.y * params.temp * clamp(0.80 + nVal * 0.45, 0.15, 1.6));

  var vel = vec3<f32>(0.0);
  if (masks.x > 0.01) {
    let rel = pos - vec3<f32>(0.0, scaledPosY, 0.0);
    let dir = select(vec3<f32>(0.0, 1.0, 0.0), normalize(rel), length(rel) > 0.001);
    let swirl = vec3<f32>(-rel.z, 0.0, rel.x);
    vel = vec3<f32>(0.0, params.velY, 0.0) * masks.x
        + dir * (params.radialVel * masks.x)
        + swirl * (params.swirlVel * masks.x);
  }

  textureStore(velDst, coord, vec4<f32>(vel, 0.0));
  textureStore(scalarDst, coord, vec4<f32>(outDensity, outTemp, 0.0, 1.0));
}
