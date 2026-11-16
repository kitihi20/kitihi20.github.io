struct GridUniforms {
  gridSize: vec3<u32>,
  pad0: u32,
};

@group(0) @binding(0) var<uniform> params: GridUniforms;
@group(0) @binding(1) var velSrc: texture_3d<f32>;
@group(0) @binding(2) var divOut: texture_storage_3d<rgba16float, write>;

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = vec3<i32>(params.gridSize);
  let p = vec3<i32>(gid);
  if (p.x >= n.x || p.y >= n.y || p.z >= n.z) {
    return;
  }

  let vC = textureLoad(velSrc, p, 0).xyz;
  let vR = select(-vC, textureLoad(velSrc, vec3<i32>(p.x + 1, p.y, p.z), 0).xyz, p.x < n.x - 1);
  let vL = select(-vC, textureLoad(velSrc, vec3<i32>(p.x - 1, p.y, p.z), 0).xyz, p.x > 0);
  let vU = select(-vC, textureLoad(velSrc, vec3<i32>(p.x, p.y + 1, p.z), 0).xyz, p.y < n.y - 1);
  let vD = select(-vC, textureLoad(velSrc, vec3<i32>(p.x, p.y - 1, p.z), 0).xyz, p.y > 0);
  let vF = select(-vC, textureLoad(velSrc, vec3<i32>(p.x, p.y, p.z + 1), 0).xyz, p.z < n.z - 1);
  let vB = select(-vC, textureLoad(velSrc, vec3<i32>(p.x, p.y, p.z - 1), 0).xyz, p.z > 0);

  let div = 0.5 * ((vR.x - vL.x) + (vU.y - vD.y) + (vF.z - vB.z));
  textureStore(divOut, p, vec4<f32>(div, 0.0, 0.0, 1.0));
}
