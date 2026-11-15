struct BakeUniforms {
  tileSize: u32,
  densityMult: f32,
  emissiveIntensity: f32,
  lightAbsorption: f32,
  domainScaleX: f32,
  domainScaleY: f32,
  domainScaleZ: f32,
  pad: f32,
};

@group(0) @binding(0) var<uniform> params: BakeUniforms;
@group(0) @binding(1) var volumeTex: texture_3d<f32>;
@group(0) @binding(2) var volumeSampler: sampler;
@group(0) @binding(3) var outPos: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var outNeg: texture_storage_2d<rgba16float, write>;

fn traceLightDir(startPos: vec3<f32>, dir: vec3<f32>, boxSize: vec3<f32>, densityMult: f32, absorption: f32) -> f32 {
  var opticalDepth = 0.0;
  let steps = 16;
  let stepLen = 0.055;
  let boxHalf = boxSize * 0.5;
  for (var i = 1; i <= steps; i = i + 1) {
    let p = startPos + dir * (f32(i) * stepLen);
    let uvw = (p + boxHalf) / boxSize;
    if (any(uvw < vec3<f32>(0.0)) || any(uvw > vec3<f32>(1.0))) {
      break;
    }
    let d = textureSampleLevel(volumeTex, volumeSampler, uvw, 0.0).r * densityMult;
    opticalDepth += d * stepLen;
  }
  return exp(-opticalDepth * absorption);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.tileSize || gid.y >= params.tileSize) {
    return;
  }

  let sizeF = f32(params.tileSize);
  let uv = (vec2<f32>(gid.xy) + 0.5) / sizeF;

  let x = uv.x - 0.5;
  let y = 0.5 - uv.y;

  let boxSize = max(vec3<f32>(params.domainScaleX, params.domainScaleY, params.domainScaleZ), vec3<f32>(0.05));
  let boxHalf = boxSize * 0.5;

  if (abs(x) > boxHalf.x || abs(y) > boxHalf.y) {
    textureStore(outPos, vec2<i32>(gid.xy), vec4<f32>(0.0, 0.0, 0.0, 0.0));
    textureStore(outNeg, vec2<i32>(gid.xy), vec4<f32>(0.0, 0.0, 0.0, 0.0));
    return;
  }

  let steps = 64;
  let stepSize = boxSize.z / f32(steps);

  var transmittance = 1.0;
  var posAcc = vec3<f32>(0.0);
  var negAcc = vec3<f32>(0.0);
  var emissiveAcc = 0.0;

  for (var i = 0; i < steps; i = i + 1) {
    if (transmittance < 0.005) {
      break;
    }
    let z = boxHalf.z - (f32(i) + 0.5) * stepSize;
    let pos = vec3<f32>(x, y, z);
    let uvw = (pos + boxHalf) / boxSize;

    let sampleVal = textureSampleLevel(volumeTex, volumeSampler, uvw, 0.0);
    let density = sampleVal.r * params.densityMult;
    let temp = sampleVal.g;

    if (density > 0.002) {
      let stepAlpha = 1.0 - exp(-density * stepSize * 2.4);
      let weight = transmittance * stepAlpha;

      let txP = traceLightDir(pos, vec3<f32>( 1.0,  0.0,  0.0), boxSize, params.densityMult, params.lightAbsorption);
      let tyP = traceLightDir(pos, vec3<f32>( 0.0,  1.0,  0.0), boxSize, params.densityMult, params.lightAbsorption);
      let tzP = traceLightDir(pos, vec3<f32>( 0.0,  0.0,  1.0), boxSize, params.densityMult, params.lightAbsorption);

      let txN = traceLightDir(pos, vec3<f32>(-1.0,  0.0,  0.0), boxSize, params.densityMult, params.lightAbsorption);
      let tyN = traceLightDir(pos, vec3<f32>( 0.0, -1.0,  0.0), boxSize, params.densityMult, params.lightAbsorption);
      let tzN = traceLightDir(pos, vec3<f32>( 0.0,  0.0, -1.0), boxSize, params.densityMult, params.lightAbsorption);

      posAcc += vec3<f32>(txP, tyP, tzP) * weight;
      negAcc += vec3<f32>(txN, tyN, tzN) * weight;
      emissiveAcc += temp * temp * params.emissiveIntensity * weight;

      transmittance *= (1.0 - stepAlpha);
    }
  }

  let alpha = clamp(1.0 - transmittance, 0.0, 1.0);
  let normFactor = select(0.0, 1.0 / alpha, alpha > 0.0001);

  let posOut = clamp(posAcc * normFactor, vec3<f32>(0.0), vec3<f32>(1.0));
  let negOut = clamp(negAcc * normFactor, vec3<f32>(0.0), vec3<f32>(1.0));
  let emOut = clamp(emissiveAcc * normFactor, 0.0, 1.0);

  textureStore(outPos, vec2<i32>(gid.xy), vec4<f32>(posOut, alpha));
  textureStore(outNeg, vec2<i32>(gid.xy), vec4<f32>(negOut, emOut));
}
