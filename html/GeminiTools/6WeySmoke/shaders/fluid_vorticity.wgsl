struct VorticityUniforms {
  gridSize: u32,
  dt: f32,
  vorticityStrength: f32,
  pad: f32,
};

@group(0) @binding(0) var<uniform> params: VorticityUniforms;
@group(0) @binding(1) var velSrc: texture_3d<f32>;
@group(0) @binding(2) var curlTex: texture_3d<f32>;
@group(0) @binding(3) var outTex: texture_storage_3d<rgba16float, write>;

@compute @workgroup_size(4, 4, 4)
fn compute_curl(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(params.gridSize);
  let p = vec3<i32>(gid);
  if (p.x >= n || p.y >= n || p.z >= n) {
    return;
  }

  let xp = min(p.x + 1, n - 1);
  let xm = max(p.x - 1, 0);
  let yp = min(p.y + 1, n - 1);
  let ym = max(p.y - 1, 0);
  let zp = min(p.z + 1, n - 1);
  let zm = max(p.z - 1, 0);

  let vR = textureLoad(velSrc, vec3<i32>(xp, p.y, p.z), 0).xyz;
  let vL = textureLoad(velSrc, vec3<i32>(xm, p.y, p.z), 0).xyz;
  let vU = textureLoad(velSrc, vec3<i32>(p.x, yp, p.z), 0).xyz;
  let vD = textureLoad(velSrc, vec3<i32>(p.x, ym, p.z), 0).xyz;
  let vF = textureLoad(velSrc, vec3<i32>(p.x, p.y, zp), 0).xyz;
  let vB = textureLoad(velSrc, vec3<i32>(p.x, p.y, zm), 0).xyz;

  let curl = 0.5 * vec3<f32>(
    (vU.z - vD.z) - (vF.y - vB.y),
    (vF.x - vB.x) - (vR.z - vL.z),
    (vR.y - vL.y) - (vU.x - vD.x)
  );

  textureStore(outTex, p, vec4<f32>(curl, length(curl)));
}

@compute @workgroup_size(4, 4, 4)
fn apply_confinement(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(params.gridSize);
  let p = vec3<i32>(gid);
  if (p.x >= n || p.y >= n || p.z >= n) {
    return;
  }

  let xp = min(p.x + 1, n - 1);
  let xm = max(p.x - 1, 0);
  let yp = min(p.y + 1, n - 1);
  let ym = max(p.y - 1, 0);
  let zp = min(p.z + 1, n - 1);
  let zm = max(p.z - 1, 0);

  let cR = textureLoad(curlTex, vec3<i32>(xp, p.y, p.z), 0).w;
  let cL = textureLoad(curlTex, vec3<i32>(xm, p.y, p.z), 0).w;
  let cU = textureLoad(curlTex, vec3<i32>(p.x, yp, p.z), 0).w;
  let cD = textureLoad(curlTex, vec3<i32>(p.x, ym, p.z), 0).w;
  let cF = textureLoad(curlTex, vec3<i32>(p.x, p.y, zp), 0).w;
  let cB = textureLoad(curlTex, vec3<i32>(p.x, p.y, zm), 0).w;

  let grad = 0.5 * vec3<f32>(cR - cL, cU - cD, cF - cB);
  let len = length(grad);
  let normGrad = select(vec3<f32>(0.0), grad / len, len > 1e-5);

  let curl = textureLoad(curlTex, p, 0).xyz;
  let force = cross(normGrad, curl) * params.vorticityStrength;

  let vel = textureLoad(velSrc, p, 0).xyz;
  textureStore(outTex, p, vec4<f32>(vel + force * params.dt, 0.0));
}
