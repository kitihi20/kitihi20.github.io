struct PackUniforms {
  width: u32,
  height: u32,
  pad0: u32,
  pad1: u32,
};

@group(0) @binding(0) var<uniform> params: PackUniforms;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> outBuf: array<u32>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  let c = textureLoad(srcTex, vec2<i32>(gid.xy), 0);
  let r = u32(clamp(c.r, 0.0, 1.0) * 65535.0 + 0.5);
  let g = u32(clamp(c.g, 0.0, 1.0) * 65535.0 + 0.5);
  let b = u32(clamp(c.b, 0.0, 1.0) * 65535.0 + 0.5);
  let a = u32(clamp(c.a, 0.0, 1.0) * 65535.0 + 0.5);

  let idx = (gid.y * params.width + gid.x) * 2u;
  outBuf[idx] = r | (g << 16u);
  outBuf[idx + 1u] = b | (a << 16u);
}
