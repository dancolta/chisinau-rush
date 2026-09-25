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

// Injects the cutout + night-emissive logic into a standard material.
function patchMaterial(mat, { emissiveAttr = false, cutout = true, nightEmissiveMap = false } = {}) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SHARED)
    shader.uniforms.uResolution = RES
    let vs = shader.vertexShader, fs = shader.fragmentShader
    vs = 'varying float vViewZ;\n' + (emissiveAttr ? 'attribute float emit;\nvarying float vEmit;\n' : '') + vs
    vs = vs.replace('#include <project_vertex>', `#include <project_vertex>
      vViewZ = -mvPosition.z;${emissiveAttr ? '\n      vEmit = emit;' : ''}`)
    fs = `varying float vViewZ;
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
    float fade = 1.0 - smoothstep(0.55, 1.0, r);
    float depthK = smoothstep(0.0, 6.0, uCutDepth - vViewZ);
    if (fade * depthK * 0.92 > bayer4(gl_FragCoord.xy)) discard;
  }`)
    }
    if (emissiveAttr) {
      fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += diffuseColor.rgb * vEmit * uNight * 2.2;`)
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
  mat.customProgramCacheKey = () => `cut:${cutout}:emit:${emissiveAttr}:nem:${nightEmissiveMap}`
  return mat
}

export class Materials {
  constructor() { this.cache = new Map() }

  // vertex-coloured procedural geometry; `emit` attribute lets parts glow at night
  vcol({ cutout = false, roughness = 0.88, metalness = 0.0, emissive = true, flat = false, key = '' } = {}) {
    const k = `vcol:${cutout}:${roughness}:${metalness}:${emissive}:${flat}:${key}`
    if (this.cache.has(k)) return this.cache.get(k)
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness, flatShading: flat })
    m.envMapIntensity = 0.55
    patchMaterial(m, { emissiveAttr: emissive, cutout })
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
