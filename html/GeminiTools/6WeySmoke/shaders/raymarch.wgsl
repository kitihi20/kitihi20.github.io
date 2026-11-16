struct RaymarchUniforms {
  cameraPos: vec4<f32>,
  cameraForward: vec4<f32>,
  cameraRight: vec4<f32>,
  cameraUp: vec4<f32>,
  lightDir: vec4<f32>,
  params: vec4<f32>,      // x: aspect, y: fovTanHalf, z: densityMult, w: emissiveIntensity
  domainScale: vec4<f32>, // xyz: box size in world space, w: flags (bit 0: showBounds, bit 1: showGrid)
  gridInfo: vec4<f32>,    // xyz: gridResolution, w: sootDarkness (0..1)
};

@group(0) @binding(0) var<uniform> u: RaymarchUniforms;
@group(0) @binding(1) var volumeTex: texture_3d<f32>;
@group(0) @binding(2) var volumeSampler: sampler;

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
  out.uv = p;
  return out;
}

fn intersectBox(ro: vec3<f32>, rd: vec3<f32>, boxMin: vec3<f32>, boxMax: vec3<f32>) -> vec2<f32> {
  let invDir = 1.0 / rd;
  let t0 = (boxMin - ro) * invDir;
  let t1 = (boxMax - ro) * invDir;
  let tMinVec = min(t0, t1);
  let tMaxVec = max(t0, t1);
  let tNear = max(max(tMinVec.x, tMinVec.y), tMinVec.z);
  let tFar = min(min(tMaxVec.x, tMaxVec.y), tMaxVec.z);
  return vec2<f32>(tNear, tFar);
}

fn fireRamp(t: f32) -> vec3<f32> {
  let c0 = vec3<f32>(0.45, 0.04, 0.01);
  let c1 = vec3<f32>(0.98, 0.24, 0.02);
  let c2 = vec3<f32>(1.00, 0.68, 0.12);
  let c3 = vec3<f32>(1.00, 0.98, 0.85);
  let x = clamp(t, 0.0, 2.0);
  if (x < 0.35) {
    return mix(c0, c1, x / 0.35);
  }
  if (x < 0.85) {
    return mix(c1, c2, (x - 0.35) / 0.50);
  }
  return mix(c2, c3, clamp((x - 0.85) / 0.80, 0.0, 1.0));
}

fn interleavedGradientNoise(pixelCoord: vec2<f32>) -> f32 {
  let magic = vec3<f32>(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(pixelCoord, magic.xy)));
}

fn hgPhase(cosTheta: f32, g: f32) -> f32 {
  let g2 = g * g;
  return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(1.0 + g2 - 2.0 * g * cosTheta, 0.001), 1.5));
}

fn boxEdgeFactor(p: vec3<f32>, boxHalf: vec3<f32>, thickness: f32) -> f32 {
  let d = abs(abs(p) - boxHalf);
  let ex = smoothstep(thickness, 0.0, max(d.y, d.z));
  let ey = smoothstep(thickness, 0.0, max(d.x, d.z));
  let ez = smoothstep(thickness, 0.0, max(d.x, d.y));
  return max(ex, max(ey, ez));
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let aspect = u.params.x;
  let fovTan = u.params.y;
  let densityMult = u.params.z;
  let emissiveIntensity = u.params.w;

  let rd = normalize(
    u.cameraForward.xyz +
    u.cameraRight.xyz * (in.uv.x * aspect * fovTan) +
    u.cameraUp.xyz * (in.uv.y * fovTan)
  );
  let ro = u.cameraPos.xyz;

  let flags = u32(u.domainScale.w + 0.5);
  let showBounds = (flags & 1u) != 0u;
  let showGrid = (flags & 2u) != 0u;

  var bgColor = mix(vec3<f32>(0.05, 0.06, 0.09), vec3<f32>(0.11, 0.14, 0.20), in.uv.y * 0.5 + 0.5);

  let boxSize = max(u.domainScale.xyz, vec3<f32>(0.05));
  let boxHalf = boxSize * 0.5;
  let hit = intersectBox(ro, rd, -boxHalf, boxHalf);
  let hasBoxHit = (hit.x <= hit.y && hit.y >= 0.0);

  // Floor spatial grid at y = -boxHalf.y (compute fwidth in uniform control flow)
  let maxBox = max(boxSize.x, max(boxSize.y, boxSize.z));
  let safeRdY = select(sign(rd.y) * 1e-4, rd.y, abs(rd.y) > 1e-4);
  let tPlane = (-boxHalf.y - ro.y) / safeRdY;
  let gp = ro + rd * tPlane;
  let cellSize = max(0.25, maxBox * 0.125);
  let gridUV = gp.xz / cellSize;
  let gridFW = max(fwidth(gridUV), vec2<f32>(1e-4));
  let gridExtent = max(boxHalf.x, boxHalf.z) + max(2.0, maxBox * 1.5);
  let maxPlaneDist = max(35.0, maxBox * 10.0);

  if (showGrid && abs(rd.y) > 1e-4 && tPlane > 0.0 && tPlane < maxPlaneDist) {
    if (abs(gp.x) <= gridExtent && abs(gp.z) <= gridExtent) {
      let gridDeriv = max(abs(fract(gridUV - 0.5) - 0.5) / gridFW, vec2<f32>(0.0));
      let line = 1.0 - min(min(gridDeriv.x, gridDeriv.y), 1.0);

      let insideBox = abs(gp.x) <= boxHalf.x + 0.004 && abs(gp.z) <= boxHalf.z + 0.004;
      let distFade = exp(-tPlane / max(6.5, maxBox * 3.5));
      let gridAlpha = line * select(0.18, 0.45, insideBox) * distFade;
      var gridCol = select(vec3<f32>(0.30, 0.36, 0.48), vec3<f32>(0.35, 0.62, 0.95), insideBox);

      let axisThick = 0.015 * max(1.0, maxBox * 0.4);
      if (abs(gp.z) < axisThick) { gridCol = vec3<f32>(0.85, 0.3, 0.3); }
      if (abs(gp.x) < axisThick) { gridCol = vec3<f32>(0.3, 0.55, 0.95); }
      bgColor = mix(bgColor, gridCol, gridAlpha);
    }
  }

  var frontEdge = 0.0;
  var backEdge = 0.0;
  if (showBounds && hasBoxHit) {
    let edgeThick = 0.008 * max(boxSize.x, max(boxSize.y, boxSize.z));
    if (hit.x > 0.0) {
      frontEdge = boxEdgeFactor(ro + rd * hit.x, boxHalf, edgeThick);
    }
    backEdge = boxEdgeFactor(ro + rd * hit.y, boxHalf, edgeThick);
    bgColor = mix(bgColor, vec3<f32>(0.32, 0.55, 0.88), backEdge * 0.45);
  }

  if (!hasBoxHit) {
    return vec4<f32>(bgColor, 1.0);
  }

  let tStart = max(hit.x, 0.0);
  let tEnd = hit.y;
  let steps = 96;
  let stepSize = (tEnd - tStart) / f32(steps);
  let lightDir = normalize(u.lightDir.xyz);
  let jitter = interleavedGradientNoise(in.pos.xy);
  let cosTheta = dot(rd, lightDir);
  let phase = mix(hgPhase(cosTheta, 0.55), hgPhase(cosTheta, -0.2), 0.35);

  var transmittance = 1.0;
  var scatteredLight = vec3<f32>(0.0);
  let avgBox = (boxSize.x + boxSize.y + boxSize.z) / 3.0;

  for (var i = 0; i < steps; i = i + 1) {
    if (transmittance < 0.008) {
      break;
    }
    let t = tStart + (f32(i) + jitter) * stepSize;
    if (t > tEnd) {
      break;
    }
    let pos = ro + rd * t;
    let uvw = (pos + boxHalf) / boxSize;

    let sampleVal = textureSampleLevel(volumeTex, volumeSampler, uvw, 0.0);
    let density = sampleVal.r * densityMult;
    let temp = sampleVal.g;

    if (density > 0.002) {
      var shadowDensity = 0.0;
      var prevDist = 0.0;
      let maxShadowDist = 0.65 * avgBox;
      for (var s = 1; s <= 6; s = s + 1) {
        let frac = (f32(s) - 0.5 + jitter * 0.5) / 6.0;
        let currDist = frac * frac * maxShadowDist;
        let ds = currDist - prevDist;
        prevDist = currDist;
        let sPos = pos + lightDir * currDist;
        let sUvw = (sPos + boxHalf) / boxSize;
        if (all(sUvw >= vec3<f32>(0.0)) && all(sUvw <= vec3<f32>(1.0))) {
          shadowDensity += textureSampleLevel(volumeTex, volumeSampler, sUvw, 0.0).r * densityMult * ds / avgBox;
        }
      }

      let beer = exp(-shadowDensity * 2.0);
      let powder = 1.0 - exp(-shadowDensity * 3.5) * 0.55;
      let lightEnergy = mix(beer, beer * powder * 1.6, 0.5) * (0.75 + phase * 1.4);

      let heightNorm = clamp(uvw.y, 0.0, 1.0);
      let sootDarkness = clamp(u.gridInfo.w, 0.0, 1.0);
      let skyAmbient = mix(vec3<f32>(0.15, 0.19, 0.30), vec3<f32>(0.28, 0.36, 0.50), heightNorm);
      let directColor = vec3<f32>(1.45, 1.36, 1.24) * lightEnergy;
      let smokeAlbedo = mix(vec3<f32>(0.94, 0.95, 0.98), vec3<f32>(0.08, 0.08, 0.09), sootDarkness);
      let burnMask = smoothstep(0.14, 1.10, temp);
      let emissive = fireRamp(temp) * burnMask * (0.5 + temp * 0.85) * emissiveIntensity;

      let stepSigma = density * (stepSize / avgBox);
      let stepAlpha = 1.0 - exp(-stepSigma * 2.5);
      let radiance = smokeAlbedo * (skyAmbient + directColor) + emissive;

      scatteredLight += transmittance * radiance * stepAlpha;
      transmittance *= (1.0 - stepAlpha);
    }
  }

  var finalColor = scatteredLight + bgColor * transmittance;
  if (showBounds && frontEdge > 0.0) {
    finalColor = mix(finalColor, vec3<f32>(0.45, 0.72, 1.0), frontEdge * 0.75);
  }
  return vec4<f32>(finalColor, 1.0);
}
