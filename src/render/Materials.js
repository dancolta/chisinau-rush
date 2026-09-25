import * as THREE from 'three'

// Shared uniforms: see-through cutout (buildings between camera and player get
// dithered away in a circle around the player) + night factor for emissive windows.
export const SHARED = {
  uCutCenter: { value: new THREE.Vector2(0.5, 0.5) },
  uCutRadius: { value: 0.16 },
  uCutDepth: { value: 1e9 },
  uCutAspect: { value: 1.6 },
  uCutOn: { value: 0 },
  uNight: { value: 0 },
  uTime: { value: 0 },
}
export const RES = { value: new THREE.Vector2(1920, 1080) }

// 3D value noise on an integer lattice (exact per cell, so it never shimmers from hashing)
const NOISE_GLSL = `
uint dh3(uvec3 v) { v = v * 1664525u + 1013904223u; v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y; v ^= v >> 16u; v.x += v.y * v.z; return v.x; }
float dhash(vec3 c) { return float(dh3(uvec3(ivec3(c) + ivec3(1 << 20))) & 0xffffu) / 65535.0; }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dhash(i), dhash(i + vec3(1,0,0)), f.x), mix(dhash(i + vec3(0,1,0)), dhash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dhash(i + vec3(0,0,1)), dhash(i + vec3(1,0,1)), f.x), mix(dhash(i + vec3(0,1,1)), dhash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// fade an octave out once it gets smaller than a couple of pixels
float octK(float freq, vec3 p) { return 1.0 - smoothstep(0.25, 0.7, length(fwidth(p)) * freq); }
`

// Injects the cutout + night-emissive logic (and optional surface detail) into a standard material.
//   detail 'plaster': fine grain + grime near the ground on flat-coloured buildings and props
//   detail 'leaf':    leaf clumps on tree crowns
function patchMaterial(mat, { emissiveAttr = false, cutout = true, nightEmissiveMap = false, detail = null } = {}) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SHARED)
    shader.uniforms.uResolution = RES
    let vs = shader.vertexShader, fs = shader.fragmentShader
    vs = 'varying float vViewZ;\n' + (detail ? 'varying vec3 vObjPos;\n' : '') + (emissiveAttr ? 'attribute float emit;\nvarying float vEmit;\n' : '') + vs
    vs = vs.replace('#include <project_vertex>', `#include <project_vertex>
      vViewZ = -mvPosition.z;${emissiveAttr ? '\n      vEmit = emit;' : ''}${detail ? '\n      vObjPos = transformed;' : ''}`)
    fs = `varying float vViewZ;
${detail ? 'varying vec3 vObjPos;\n' + NOISE_GLSL : ''}
uniform vec2 uCutCenter;
uniform float uCutRadius;
uniform float uCutDepth;
uniform float uCutAspect;
uniform float uCutOn;
uniform float uNight;
uniform vec2 uResolution;
${emissiveAttr ? 'varying float vEmit;' : ''}
float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}
` + fs
    if (cutout) {
      fs = fs.replace('void main() {', `void main() {
  if (uCutOn > 0.5 && vViewZ < uCutDepth) {
    vec2 sp = gl_FragCoord.xy / uResolution;
    vec2 dd = (sp - uCutCenter) * vec2(uCutAspect, 1.0);
    float r = length(dd) / uCutRadius;
    // solid cut with a thin dithered rim: a wide dither band crawls visibly as the camera moves
    float fade = 1.0 - smoothstep(0.82, 1.0, r);
    float depthK = smoothstep(0.0, 1.5, uCutDepth - vViewZ);
    if (fade * depthK > bayer4(gl_FragCoord.xy)) discard;
  }`)
    }
    if (detail === 'plaster') {
      fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec3 p = vObjPos;
    float d = 0.94 + 0.09 * vnoise(p * 0.9) + 0.06 * vnoise(p * 3.7) * octK(3.7, p) + 0.035 * vnoise(p * 13.0) * octK(13.0, p);
    float grime = mix(0.8, 1.0, smoothstep(0.15, 1.5, p.y));
    diffuseColor.rgb *= d * grime;
  }`)
    } else if (detail === 'leaf') {
      fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec3 p = vObjPos;
    float k = vnoise(p * 2.3);
    k = mix(k, k * 0.45 + vnoise(p * 7.1) * 0.55, octK(7.1, p));
    diffuseColor.rgb *= mix(0.66, 1.16, smoothstep(0.28, 0.72, k));
  }`)
    }
    if (emissiveAttr) {
      // emit < 0 marks glass: smooth and reflective, never glowing
      fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += diffuseColor.rgb * max(vEmit, 0.0) * uNight * 2.2;`)
      fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  if (vEmit < -0.5) roughnessFactor = 0.07;`)
    }
    if (nightEmissiveMap) {
      fs = fs.replace('#include <emissivemap_fragment>', `#ifdef USE_EMISSIVEMAP
  vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
  totalEmissiveRadiance *= emissiveColor.rgb * uNight;
#endif`)
    }
    shader.vertexShader = vs
    shader.fragmentShader = fs
  }
  mat.customProgramCacheKey = () => `cut:${cutout}:emit:${emissiveAttr}:nem:${nightEmissiveMap}:det:${detail}`
  return mat
}

export class Materials {
  constructor() { this.cache = new Map() }

  // vertex-coloured procedural geometry; `emit` attribute lets parts glow at night
  vcol({ cutout = false, roughness = 0.88, metalness = 0.0, emissive = true, flat = false, key = '', detail = null } = {}) {
    const k = `vcol:${cutout}:${roughness}:${metalness}:${emissive}:${flat}:${key}:${detail}`
    if (this.cache.has(k)) return this.cache.get(k)
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness, flatShading: flat })
    m.envMapIntensity = 0.55
    patchMaterial(m, { emissiveAttr: emissive, cutout, detail })
    this.cache.set(k, m)
    return m
  }

  // KayKit palette atlas material (optionally with a night-only emissive mask)
  atlas(texture, { cutout = false, emissiveMap = null, key = '' } = {}) {
    const k = `atlas:${cutout}:${!!emissiveMap}:${key}`
    if (this.cache.has(k)) return this.cache.get(k)
    const m = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.72, metalness: 0.05 })
    m.envMapIntensity = 0.6
    if (emissiveMap) { m.emissiveMap = emissiveMap; m.emissive = new THREE.Color(0xffc978); m.emissiveIntensity = 1.6 }
    patchMaterial(m, { cutout, nightEmissiveMap: !!emissiveMap })
    this.cache.set(k, m)
    return m
  }

  basic(color, opts = {}) {
    const k = `basic:${color}:${JSON.stringify(opts)}`
    if (this.cache.has(k)) return this.cache.get(k)
    const m = new THREE.MeshBasicMaterial({ color, ...opts })
    this.cache.set(k, m)
    return m
  }
}
