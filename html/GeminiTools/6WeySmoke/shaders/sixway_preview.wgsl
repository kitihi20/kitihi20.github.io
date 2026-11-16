struct SixWayUniforms {
  lightDir: vec4<f32>,
  lightColor: vec4<f32>,
  ambientColor: vec4<f32>,
  viewParams: vec4<f32>, // x: aspect, y: debugMode, z: sootDarkness, w: unused
};

@group(0) @binding(0) var<uniform> u: SixWayUniforms;
@group(0) @binding(1) var texPos: texture_2d<f32>;
@group(0) @binding(2) var texNeg: texture_2d<f32>;
@group(0) @binding(3) var texSampler: sampler;

struct VertexOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VertexOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  let p = positions[vid];
  var out: VertexOut;
  out.pos = vec4<f32>(p, 0.0, 1.0);
  out.uv = vec2<f32>(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return out;
}

fn fireRamp(t: f32) -> vec3<f32> {
  let c1 = vec3<f32>(0.9, 0.16, 0.02);
  let c2 = vec3<f32>(1.0, 0.56, 0.08);
  let c3 = vec3<f32>(1.0, 0.95, 0.72);
  if (t < 0.5) {
    return mix(c1, c2, t * 2.0);
  }
  return mix(c2, c3, (t - 0.5) * 2.0);
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let aspect = u.viewParams.x;
  let debugMode = i32(u.viewParams.y + 0.5);

  var quadUV = (in.uv - 0.5) * vec2<f32>(aspect, 1.0) * 1.18 + 0.5;
  let bgGrad = mix(vec3<f32>(0.05, 0.06, 0.09), vec3<f32>(0.10, 0.13, 0.19), 1.0 - in.uv.y);

  let posSample = textureSample(texPos, texSampler, clamp(quadUV, vec2<f32>(0.0), vec2<f32>(1.0)));
  let negSample = textureSample(texNeg, texSampler, clamp(quadUV, vec2<f32>(0.0), vec2<f32>(1.0)));

  let inQuad = all(quadUV >= vec2<f32>(0.0)) && all(quadUV <= vec2<f32>(1.0));
  if (!inQuad) {
    return vec4<f32>(bgGrad, 1.0);
  }

  let checker = ((i32(floor(quadUV.x * 16.0)) + i32(floor(quadUV.y * 16.0))) & 1) == 0;
  let checkerBg = select(vec3<f32>(0.09, 0.11, 0.15), vec3<f32>(0.12, 0.14, 0.19), checker);

  let alpha = posSample.a;
  let emissiveVal = negSample.a;

  if (debugMode == 1) {
    return vec4<f32>(mix(checkerBg, posSample.rgb, alpha), 1.0);
  }
  if (debugMode == 2) {
    return vec4<f32>(mix(checkerBg, negSample.rgb, alpha), 1.0);
  }
  if (debugMode == 3) {
    return vec4<f32>(vec3<f32>(alpha, emissiveVal, 0.0), 1.0);
  }

  let lDir = normalize(u.lightDir.xyz);
  let posW = max(lDir, vec3<f32>(0.0));
  let negW = max(-lDir, vec3<f32>(0.0));

  let lightMap = dot(posSample.rgb, posW) + dot(negSample.rgb, negW);
  let sootDarkness = clamp(u.viewParams.z, 0.0, 1.0);
  let smokeAlbedo = mix(vec3<f32>(0.92, 0.94, 0.97), vec3<f32>(0.09, 0.09, 0.10), sootDarkness);
  let direct = u.lightColor.rgb * u.lightColor.a * lightMap;
  let ambient = u.ambientColor.rgb;
  let emissive = fireRamp(emissiveVal) * emissiveVal * u.ambientColor.a;

  let litColor = smokeAlbedo * (direct + ambient) + emissive;
  let finalColor = mix(checkerBg, litColor, alpha);
  return vec4<f32>(finalColor, 1.0);
}
