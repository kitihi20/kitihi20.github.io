struct CloudPhysicsUniforms {
  gridSize: vec3<u32>,
  dt: f32,
  time: f32,
  condensationLevel: f32,
  humidity: f32,
  latentHeat: f32,
  tropopauseY: f32,
  windShear: f32,
  spaceX: f32,
  spaceY: f32,
  spaceZ: f32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
};

@group(0) @binding(0) var<uniform> params: CloudPhysicsUniforms;
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

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = params.gridSize;
  if (gid.x >= n.x || gid.y >= n.y || gid.z >= n.z) {
    return;
  }

  let uvw = (vec3<f32>(gid) + 0.5) / vec3<f32>(n);
  let posNorm = uvw * 2.0 - 1.0; // [-1, 1]^3 normalized
  let space = vec3<f32>(params.spaceX, params.spaceY, params.spaceZ);
  let pos = posNorm * space;

  var vel = textureLoad(velSrc, vec3<i32>(gid), 0).xyz;
  let sc = textureLoad(scalarSrc, vec3<i32>(gid), 0);
  var qc = sc.r;
  var temp = sc.g;
  var qv = sc.b;

  // 1. Ground solar heating & moisture evaporation near the bottom boundary
  if (posNorm.y < -0.52) {
    let groundMask = 1.0 - smoothstep(-0.90, -0.52, posNorm.y);
    let radialMask = 1.0 - smoothstep(0.18, 0.78, length(posNorm.xz));
    let thermalPatch = clamp(0.70 + 0.65 * noise3(vec3<f32>(pos.x * 4.5, params.time * 0.25, pos.z * 4.5)), 0.0, 1.45);
    let flux = groundMask * radialMask * thermalPatch * params.dt * 4.2;
    qv = min(2.4, qv + params.humidity * flux);
    temp = min(1.5, temp + 0.85 * flux);
    vel.y += 0.42 * params.spaceY * flux;
  }

  // 2. Altitude-dependent saturation mixing ratio q_vs(y) with 3D turbulent perturbation
  let nDetail = noise3(pos * 6.5 + vec3<f32>(0.0, -params.time * 0.3, 0.0)) * 0.14
              + noise3(pos * 13.0 + vec3<f32>(3.1, params.time * 0.4, 1.7)) * 0.07;
  let heightAboveLCL = posNorm.y - params.condensationLevel;
  let qvsBase = mix(1.30, 0.10, smoothstep(-0.18, 0.30, heightAboveLCL));
  let qvs = max(0.05, qvsBase + nDetail);

  // 3. Condensation (qv -> qc + latent heat) & Evaporation
  if (qv > qvs) {
    let condense = (qv - qvs) * min(1.0, params.dt * 7.0);
    qv -= condense;
    qc = min(2.5, qc + condense);
    temp = min(1.6, temp + condense * params.latentHeat);
  } else if (qc > 0.0005) {
    let evap = min(qc, (qvs - qv) * min(1.0, params.dt * 4.5));
    qc -= evap;
    qv += evap;
    temp = max(-0.4, temp - evap * params.latentHeat * 0.45);
  }

  // 4. Tropopause thermal inversion layer
  if (posNorm.y > params.tropopauseY - 0.12) {
    let invStrength = smoothstep(params.tropopauseY - 0.12, params.tropopauseY + 0.18, posNorm.y);
    temp = mix(temp, -0.25, invStrength * min(1.0, params.dt * 6.0));
    vel.y *= (1.0 - invStrength * min(0.92, params.dt * 6.0));
  }

  // 5. Soft side/top boundary cushion
  let radialXZ = length(posNorm.xz);
  if (radialXZ > 0.72) {
    let sideFade = smoothstep(0.72, 0.94, radialXZ);
    qc *= (1.0 - sideFade * min(0.9, params.dt * 5.0));
    vel.x *= (1.0 - sideFade * 0.5);
    vel.z *= (1.0 - sideFade * 0.5);
  }
  if (posNorm.y > params.tropopauseY + 0.22) {
    let topFade = smoothstep(params.tropopauseY + 0.22, 0.94, posNorm.y);
    qc *= (1.0 - topFade * min(0.9, params.dt * 6.0));
  }

  // 6. Upper-altitude wind shear
  let shearFactor = smoothstep(params.condensationLevel, params.tropopauseY, posNorm.y)
                  * (1.0 - smoothstep(0.60, 0.90, radialXZ));
  vel.x += params.windShear * shearFactor * params.dt * 1.1;

  textureStore(velDst, vec3<i32>(gid), vec4<f32>(vel, 0.0));
  textureStore(scalarDst, vec3<i32>(gid), vec4<f32>(qc, temp, qv, 1.0));
}
