struct GridUniforms {
  gridSize: vec3<u32>,
  pad0: u32,
};

@group(0) @binding(0) var<uniform> params: GridUniforms;
@group(0) @binding(1) var velSrc: texture_3d<f32>;
@group(0) @binding(2) var pressureTex: texture_3d<f32>;
@group(0) @binding(3) var velDst: texture_storage_3d<rgba16float, write>;

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = vec3<i32>(params.gridSize);
  let p = vec3<i32>(gid);
  if (p.x >= n.x || p.y >= n.y || p.z >= n.z) {
    return;
  }

  let pR = textureLoad(pressureTex, vec3<i32>(min(p.x + 1, n.x - 1), p.y, p.z), 0).r;
  let pL = textureLoad(pressureTex, vec3<i32>(max(p.x - 1, 0), p.y, p.z), 0).r;
  let pU = textureLoad(pressureTex, vec3<i32>(p.x, min(p.y + 1, n.y - 1), p.z), 0).r;
  let pD = textureLoad(pressureTex, vec3<i32>(p.x, max(p.y - 1, 0), p.z), 0).r;
  let pF = textureLoad(pressureTex, vec3<i32>(p.x, p.y, min(p.z + 1, n.z - 1)), 0).r;
  let pB = textureLoad(pressureTex, vec3<i32>(p.x, p.y, max(p.z - 1, 0)), 0).r;

  var vel = textureLoad(velSrc, p, 0).xyz;
  vel -= 0.5 * vec3<f32>(pR - pL, pU - pD, pF - pB);

  if (p.x == 0 || p.x == n.x - 1 || p.y == 0 || p.y == n.y - 1 || p.z == 0 || p.z == n.z - 1) {
    vel = vec3<f32>(0.0);
  }

  textureStore(velDst, p, vec4<f32>(vel, 0.0));
}
