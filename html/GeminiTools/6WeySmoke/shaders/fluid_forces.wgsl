struct ForcesUniforms {
  gridSize: vec3<u32>,
  shapeType: u32,
  emissionMode: u32, // 0=BurstOnly, 1=Continuous, 2=Burst+Continuous
  dt: f32,
  time: f32,
  simAge: f32,
  buoyancy: f32,
  gravity: f32,
  noiseTurbulence: f32,
  afterburnSec: f32,
  radius: f32,
  posY: f32,
  density: f32,
  temp: f32,
  velY: f32,
  radialVel: f32,
  swirlVel: f32,
  pad0: f32,
  spaceX: f32,
  spaceY: f32,
  spaceZ: f32,
  pad1: f32,
};

@group(0) @binding(0) var<uniform> params: ForcesUniforms;
@group(0) @binding(1) var velSrc: texture_3d<f32>;
@group(0) @binding(2) var scalarSrc: texture_3d<f32>;
@group(0) @binding(3) var velDst: texture_storage_3d<rgba16float, write>;
@group(0) @binding(4) var scalarDst: texture_storage_3d<rgba16float, write>;

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

fn evalShapeMask(pos: vec3<f32>, shapeType: u32, radius: f32, posY: f32, nVal: f32) -> f32 {
  let center = vec3<f32>(0.0, posY, 0.0);
  let rel = pos - center;
  let r = max(radius, 0.05);

  if (shapeType == 0u) {
    let d = length(rel);
    return smoothstep(r, r * 0.15, d + nVal * r * 0.25);
  } else if (shapeType == 1u) {
    let radial = length(rel.xz);
    let halfH = r * 1.6;
    let yMask = smoothstep(-halfH, -halfH * 0.4, rel.y) * smoothstep(halfH, halfH * 0.4, rel.y);
    return smoothstep(r * 0.75, r * 0.1, radial + nVal * r * 0.2) * yMask;
  } else if (shapeType == 2u) {
    let ringR = r * 0.75;
    let tubeR = max(r * 0.35, 0.06);
    let torusDist = length(vec2<f32>(length(rel.xz) - ringR, rel.y));
    return smoothstep(tubeR, tubeR * 0.15, torusDist + nVal * tubeR * 0.25);
  } else if (shapeType == 3u) {
    let radial = length(rel.xz);
    let halfH = max(r * 0.35, 0.08);
    let yMask = smoothstep(-halfH, -halfH * 0.2, rel.y) * smoothstep(halfH, halfH * 0.2, rel.y);
    return smoothstep(r * 1.4, r * 0.3, radial + nVal * r * 0.2) * yMask;
  } else {
    // 4: Afterburn central stem feeding the rising fireball
    let radial = length(rel.xz);
    let stemR = r * 0.65;
    let yMask = smoothstep(-r * 0.5, 0.0, rel.y) * smoothstep(r * 1.1, r * 0.2, rel.y);
    return smoothstep(stemR, stemR * 0.15, radial + nVal * stemR * 0.3) * yMask;
  }
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = params.gridSize;
  if (gid.x >= n.x || gid.y >= n.y || gid.z >= n.z) {
    return;
  }

  let uvw = (vec3<f32>(gid) + 0.5) / vec3<f32>(n);
  let space = vec3<f32>(params.spaceX, params.spaceY, params.spaceZ);
  let pos = (uvw * 2.0 - 1.0) * space;

  var vel = textureLoad(velSrc, vec3<i32>(gid), 0).xyz;
  let sc = textureLoad(scalarSrc, vec3<i32>(gid), 0);
  var outDensity = sc.r;
  var outTemp = sc.g;

  let nVal = noise3(pos * 4.5 + vec3<f32>(0.0, -params.time * 1.4, params.time * 0.5));
  let turb = vec3<f32>(
    noise3(pos * 5.0 + vec3<f32>(11.3, params.time, 2.1)),
    noise3(pos * 5.0 + vec3<f32>(4.7, -params.time, 8.9)),
    noise3(pos * 5.0 + vec3<f32>(9.1, 3.3, -params.time))
  );

  let scaledPosY = params.posY * params.spaceY;
  let inAfterburn = (params.afterburnSec > 0.001) && (params.simAge < params.afterburnSec);
  let shouldEmit = (params.emissionMode != 0u) || inAfterburn;

  if (shouldEmit) {
    let afterburnFade = select(1.0, 1.0 - params.simAge / max(params.afterburnSec, 0.01), params.emissionMode == 0u);
    let mask = evalShapeMask(pos, params.shapeType, params.radius, scaledPosY, nVal) * afterburnFade;
    if (mask > 0.005) {
      let rate = mask * params.dt * 6.0;
      outDensity = min(12.0, outDensity + params.density * rate);
      outTemp = min(12.0, outTemp + params.temp * rate);

      let rel = pos - vec3<f32>(0.0, scaledPosY, 0.0);
      let dir = select(vec3<f32>(0.0, 1.0, 0.0), normalize(rel), length(rel) > 0.001);
      let swirl = vec3<f32>(-rel.z, 0.0, rel.x);
      vel += (vec3<f32>(0.0, params.velY, 0.0) + dir * params.radialVel + swirl * params.swirlVel) * (mask * params.dt * 3.0);
    }
  }

  vel.y += (params.buoyancy * outTemp - params.gravity * outDensity) * params.dt;
  vel += turb * (params.noiseTurbulence * min(outDensity, 2.0) * params.dt);

  textureStore(velDst, vec3<i32>(gid), vec4<f32>(vel, 0.0));
  textureStore(scalarDst, vec3<i32>(gid), vec4<f32>(outDensity, outTemp, sc.b, 1.0));
}
