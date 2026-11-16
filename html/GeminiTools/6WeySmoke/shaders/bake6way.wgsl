struct BakeUniforms {
  camForward: vec4<f32>,
  camRight: vec4<f32>,
  camUp: vec4<f32>,
  boxSize: vec4<f32>,
  params: vec4<f32>, // x: tileSize (bitcast/f32), y: densityMult, z: emissiveIntensity, w: lightAbsorption
};

@group(0) @binding(0) var<uniform> u: BakeUniforms;
@group(0) @binding(1) var volumeTex: texture_3d<f32>;
@group(0) @binding(2) var volumeSampler: sampler;
@group(0) @binding(3) var outPos: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var outNeg: texture_storage_2d<rgba16float, write>;

fn intersectBox(ro: vec3<f32>, rd: vec3<f32>, boxMin: vec3<f32>, boxMax: vec3<f32>) -> vec2<f32> {
  let invDir = 1.0 / select(rd, vec3<f32>(1e-5), abs(rd) < vec3<f32>(1e-5));
  let t0 = (boxMin - ro) * invDir;
  let t1 = (boxMax - ro) * invDir;
  let tMinVec = min(t0, t1);
  let tMaxVec = max(t0, t1);
  let tNear = max(max(tMinVec.x, tMinVec.y), tMinVec.z);
  let tFar = min(min(tMaxVec.x, tMaxVec.y), tMaxVec.z);
  return vec2<f32>(tNear, tFar);
}

fn traceLightDir(startPos: vec3<f32>, dir: vec3<f32>, boxSize: vec3<f32>, avgBox: f32, densityMult: f32, absorption: f32) -> f32 {
  var opticalDepth = 0.0;
  let steps = 16;
  let stepLen = 0.055 * avgBox;
  let boxHalf = boxSize * 0.5;
  for (var i = 1; i <= steps; i = i + 1) {
    let p = startPos + dir * (f32(i) * stepLen);
    let uvw = (p + boxHalf) / boxSize;
    if (any(uvw < vec3<f32>(0.0)) || any(uvw > vec3<f32>(1.0))) {
      break;
    }
    let d = textureSampleLevel(volumeTex, volumeSampler, uvw, 0.0).r * densityMult;
    opticalDepth += d * (stepLen / avgBox);
  }
  return exp(-opticalDepth * absorption);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let tileSize = u32(u.params.x + 0.5);
  if (gid.x >= tileSize || gid.y >= tileSize) {
    return;
  }

  let densityMult = u.params.y;
  let emissiveIntensity = u.params.z;
  let lightAbsorption = u.params.w;

  let uv = (vec2<f32>(gid.xy) + 0.5) / f32(tileSize);
  let boxSize = max(u.boxSize.xyz, vec3<f32>(0.05));
  let boxHalf = boxSize * 0.5;
  let avgBox = (boxSize.x + boxSize.y + boxSize.z) / 3.0;
  let maxSpan = max(boxSize.x, max(boxSize.y, boxSize.z));

  let fwd = normalize(u.camForward.xyz);
  let right = normalize(u.camRight.xyz);
  let up = normalize(u.camUp.xyz);

  // Orthographic ray spanning [-maxSpan/2, maxSpan/2] across the tile
  let ro = right * ((uv.x - 0.5) * maxSpan) + up * ((0.5 - uv.y) * maxSpan) - fwd * (maxSpan * 2.0);
  let hit = intersectBox(ro, fwd, -boxHalf, boxHalf);

  if (hit.x > hit.y || hit.y < 0.0) {
    textureStore(outPos, vec2<i32>(gid.xy), vec4<f32>(0.0, 0.0, 0.0, 0.0));
    textureStore(outNeg, vec2<i32>(gid.xy), vec4<f32>(0.0, 0.0, 0.0, 0.0));
    return;
  }

  let tStart = max(hit.x, 0.0);
  let tEnd = hit.y;
  let steps = 64;
  let stepSize = (tEnd - tStart) / f32(steps);

  var transmittance = 1.0;
  var posAcc = vec3<f32>(0.0);
  var negAcc = vec3<f32>(0.0);
  var emissiveAcc = 0.0;

  // Tangent-space 6-way basis aligned with the bake camera:
  // +X = right, +Y = up, +Z = -fwd (toward camera)
  let dirXP = right;
  let dirYP = up;
  let dirZP = -fwd;

  for (var i = 0; i < steps; i = i + 1) {
    if (transmittance < 0.005) {
      break;
    }
    let t = tStart + (f32(i) + 0.5) * stepSize;
    let pos = ro + fwd * t;
    let uvw = (pos + boxHalf) / boxSize;

    let sampleVal = textureSampleLevel(volumeTex, volumeSampler, uvw, 0.0);
    let density = sampleVal.r * densityMult;
    let temp = sampleVal.g;

    if (density > 0.002) {
      let stepAlpha = 1.0 - exp(-density * (stepSize / avgBox) * 2.4);
      let weight = transmittance * stepAlpha;

      let txP = traceLightDir(pos,  dirXP, boxSize, avgBox, densityMult, lightAbsorption);
      let tyP = traceLightDir(pos,  dirYP, boxSize, avgBox, densityMult, lightAbsorption);
      let tzP = traceLightDir(pos,  dirZP, boxSize, avgBox, densityMult, lightAbsorption);

      let txN = traceLightDir(pos, -dirXP, boxSize, avgBox, densityMult, lightAbsorption);
      let tyN = traceLightDir(pos, -dirYP, boxSize, avgBox, densityMult, lightAbsorption);
      let tzN = traceLightDir(pos, -dirZP, boxSize, avgBox, densityMult, lightAbsorption);

      posAcc += vec3<f32>(txP, tyP, tzP) * weight;
      negAcc += vec3<f32>(txN, tyN, tzN) * weight;
      emissiveAcc += temp * temp * emissiveIntensity * weight;

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
