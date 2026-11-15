struct GridUniforms {
  gridSize: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
};

@group(0) @binding(0) var<uniform> params: GridUniforms;
@group(0) @binding(1) var pressureSrc: texture_3d<f32>;
@group(0) @binding(2) var divTex: texture_3d<f32>;
@group(0) @binding(3) var pressureDst: texture_storage_3d<rgba16float, write>;

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(params.gridSize);
  let p = vec3<i32>(gid);
  if (p.x >= n || p.y >= n || p.z >= n) {
    return;
  }

  let pR = textureLoad(pressureSrc, vec3<i32>(min(p.x + 1, n - 1), p.y, p.z), 0).r;
  let pL = textureLoad(pressureSrc, vec3<i32>(max(p.x - 1, 0), p.y, p.z), 0).r;
  let pU = textureLoad(pressureSrc, vec3<i32>(p.x, min(p.y + 1, n - 1), p.z), 0).r;
  let pD = textureLoad(pressureSrc, vec3<i32>(p.x, max(p.y - 1, 0), p.z), 0).r;
  let pF = textureLoad(pressureSrc, vec3<i32>(p.x, p.y, min(p.z + 1, n - 1)), 0).r;
  let pB = textureLoad(pressureSrc, vec3<i32>(p.x, p.y, max(p.z - 1, 0)), 0).r;

  let div = textureLoad(divTex, p, 0).r;
  let newP = (pR + pL + pU + pD + pF + pB - div) / 6.0;
  textureStore(pressureDst, p, vec4<f32>(newP, 0.0, 0.0, 1.0));
}
