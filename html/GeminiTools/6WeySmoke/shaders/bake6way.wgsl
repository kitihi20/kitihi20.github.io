struct BakeUniforms {
  camForward: vec4<f32>,
  camRight: vec4<f32>,
  camUp: vec4<f32>,
  boxSize: vec4<f32>,
  params: vec4<f32>, // x: tileSize, y: densityMult, z: emissiveIntensity, w: lightAbsorption
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

fn sampleDensity(pos: vec3<f32>, boxSize: vec3<f32>, boxHalf: vec3<f32>, densityMult: f32) -> f32 {
  let uvw = (pos + boxHalf) / boxSize;
  if (any(uvw < vec3<f32>(0.0)) || any(uvw > vec3<f32>(1.0))) {
    return 0.0;
  }
  return textureSampleLevel(volumeTex, volumeSampler, uvw, 0.0).r * densityMult;
}

fn computeDensityNormal(pos: vec3<f32>, boxSize: vec3<f32>, boxHalf: vec3<f32>, avgBox: f32, densityMult: f32) -> vec4<f32> {
  let eps = 0.022 * avgBox;
  let gx = sampleDensity(pos + vec3<f32>(eps, 0.0, 0.0), boxSize, boxHalf, densityMult)
         - sampleDensity(pos - vec3<f32>(eps, 0.0, 0.0), boxSize, boxHalf, densityMult);
  let gy = sampleDensity(pos + vec3<f32>(0.0, eps, 0.0), boxSize, boxHalf, densityMult)
         - sampleDensity(pos - vec3<f32>(0.0, eps, 0.0), boxSize, boxHalf, densityMult);
  let gz = sampleDensity(pos + vec3<f32>(0.0, 0.0, eps), boxSize, boxHalf, densityMult)
         - sampleDensity(pos - vec3<f32>(0.0, 0.0, eps), boxSize, boxHalf, densityMult);
  let grad = -vec3<f32>(gx, gy, gz);
  let len = length(grad);
  let n = select(vec3<f32>(0.0), grad / len, len > 1e-4);
  return vec4<f32>(n, len);
}

fn traceLightDir(
  startPos: vec3<f32>,
  dir: vec3<f32>,
  normal: vec3<f32>,
  normalStrength: f32,
  boxSize: vec3<f32>,
  boxHalf: vec3<f32>,
  avgBox: f32,
  densityMult: f32,
  absorption: f32
) -> f32 {
  // Offset start slightly along outward normal so dense surface lobes don't self-shadow on step 1
  let marchStart = startPos + normal * (0.018 * avgBox * normalStrength);
  var opticalDepth = 0.0;
  let steps = 14;
  let maxDist = 0.85 * avgBox;
  var prevDist = 0.0;

  // Compress extreme densityMult in shadow rays so dense smoke retains volumetric multi-scatter wrap
  let shadowDensityScale = min(densityMult, 3.5 + log2(max(densityMult - 2.5, 1.0)));
  let densityRatio = shadowDensityScale / max(densityMult, 1e-4);

  for (var i = 1; i <= steps; i = i + 1) {
    let frac = f32(i) / f32(steps);
    let currDist = frac * frac * maxDist;
    let ds = currDist - prevDist;
    prevDist = currDist;
    let d = sampleDensity(marchStart + dir * currDist, boxSize, boxHalf, densityMult) * densityRatio;
    opticalDepth += d * (ds / avgBox);
  }

  let directT = exp(-opticalDepth * absorption);
  let multiScatterT = exp(-opticalDepth * absorption * 0.28) * 0.35;
  let transmittance = clamp(mix(directT, max(directT, multiScatterT), 0.55), 0.0, 1.0);

  // Directional Lambert-wrap modulation from density gradient normal (creates crisp 3D relief on dense lobes)
  let ndl = clamp(dot(normal, dir) * 0.65 + 0.35, 0.0, 1.0);
  let directionalFactor = mix(1.0, ndl, normalStrength * 0.72);
  return clamp(transmittance * directionalFactor, 0.0, 1.0);
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

  // Unity VFX Graph Six-Way Smoke Lit channel convention (left-handed tangent space):
  // Lightmap A (Pos): R = Right (+X), G = Top (+Y),    B = Back (+Z, away from camera = fwd),  A = Alpha
  // Lightmap B (Neg): R = Left (-X),  G = Bottom (-Y), B = Front (-Z, toward camera = -fwd),  A = Emissive
  let dirRight  = right;
  let dirLeft   = -right;
  let dirTop    = up;
  let dirBottom = -up;
  let dirBack   = fwd;
  let dirFront  = -fwd;

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

      let nInfo = computeDensityNormal(pos, boxSize, boxHalf, avgBox, densityMult);
      let normal = nInfo.xyz;
      let normalStrength = clamp(nInfo.w * 1.2, 0.0, 1.0);

      let lRight  = traceLightDir(pos, dirRight,  normal, normalStrength, boxSize, boxHalf, avgBox, densityMult, lightAbsorption);
      let lTop    = traceLightDir(pos, dirTop,    normal, normalStrength, boxSize, boxHalf, avgBox, densityMult, lightAbsorption);
      let lBack   = traceLightDir(pos, dirBack,   normal, normalStrength, boxSize, boxHalf, avgBox, densityMult, lightAbsorption);

      let lLeft   = traceLightDir(pos, dirLeft,   normal, normalStrength, boxSize, boxHalf, avgBox, densityMult, lightAbsorption);
      let lBottom = traceLightDir(pos, dirBottom, normal, normalStrength, boxSize, boxHalf, avgBox, densityMult, lightAbsorption);
      let lFront  = traceLightDir(pos, dirFront,  normal, normalStrength, boxSize, boxHalf, avgBox, densityMult, lightAbsorption);

      posAcc += vec3<f32>(lRight, lTop, lBack) * weight;
      negAcc += vec3<f32>(lLeft, lBottom, lFront) * weight;
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
