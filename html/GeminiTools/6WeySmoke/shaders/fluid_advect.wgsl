struct AdvectUniforms {
  gridSize: u32,
  dt: f32,
  velDissipation: f32,
  densityDissipation: f32,
  tempDissipation: f32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
};

@group(0) @binding(0) var<uniform> params: AdvectUniforms;
@group(0) @binding(1) var velSrc: texture_3d<f32>;
@group(0) @binding(2) var scalarSrc: texture_3d<f32>;
@group(0) @binding(3) var linSampler: sampler;
@group(0) @binding(4) var velDst: texture_storage_3d<rgba16float, write>;
@group(0) @binding(5) var scalarDst: texture_storage_3d<rgba16float, write>;

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = params.gridSize;
  if (gid.x >= n || gid.y >= n || gid.z >= n) {
    return;
  }

  let nF = f32(n);
  let uvw = (vec3<f32>(gid) + 0.5) / nF;
  let vel = textureLoad(velSrc, vec3<i32>(gid), 0).xyz;

  // Backtrace in normalized [0, 1]^3 space
  let prevUvw = clamp(uvw - vel * params.dt, vec3<f32>(0.5 / nF), vec3<f32>(1.0 - 0.5 / nF));

  let dtScale = params.dt * 60.0;
  var advectedVel = textureSampleLevel(velSrc, linSampler, prevUvw, 0.0).xyz * pow(params.velDissipation, dtScale);
  let prevScalar = textureSampleLevel(scalarSrc, linSampler, prevUvw, 0.0);

  // Soft boundary fade near box edges to avoid clipping artifacts
  let edgeDist = min(min(uvw.x, 1.0 - uvw.x), min(min(uvw.y, 1.0 - uvw.y), min(uvw.z, 1.0 - uvw.z)));
  let edgeFade = smoothstep(0.0, 0.08, edgeDist);

  if (gid.x == 0u || gid.x == n - 1u || gid.y == 0u || gid.y == n - 1u || gid.z == 0u || gid.z == n - 1u) {
    advectedVel = vec3<f32>(0.0);
  }

  let newDensity = max(0.0, prevScalar.r * pow(params.densityDissipation, dtScale) * edgeFade);
  let newTemp = max(0.0, prevScalar.g * pow(params.tempDissipation, dtScale) * edgeFade);
  let newVapor = max(0.0, prevScalar.b * pow(mix(params.densityDissipation, 0.996, 0.7), dtScale) * edgeFade);

  textureStore(velDst, vec3<i32>(gid), vec4<f32>(advectedVel, 0.0));
  textureStore(scalarDst, vec3<i32>(gid), vec4<f32>(newDensity, newTemp, newVapor, 1.0));
}
