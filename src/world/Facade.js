import * as THREE from 'three'
import { SHARED, RES } from '../render/Materials.js'
import { buildFacadeTextures, FACADE_LAYERS } from '../render/FacadeTextures.js'

// Procedural facade material: windows, panel seams and night-lit rooms are
// computed in the fragment shader from wall-space UVs (metres), so a whole
// 9-storey panel block costs a few dozen vertices.
//
// Per-vertex attributes:
//   uv       wall-space coords (u = metres along wall, v = metres above base)
//   facade   vec4(floorH, winSpacing, seed, style)
//            style 0 = plain wall, 1 = panel block, 2 = office ribbon windows,
//                  3 = ruin (dark/broken), 4 = classical tall windows, 5 = shopfront ground floor + panel above,
//                  6 = loggia stack, 7 = brick with tall windows,
//                  8 / 9 = classical / brick upper floors over a shopfront ground floor,
//                  10 = bare panel gable end
//   color    wall colour, emit (unused here)

export class FacadeBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; this.fac = [] }

  // one wall quad from (x0,z0) to (x1,z1), base y0, height h. Outward normal is to the RIGHT of the
  // direction (x0,z0)->(x1,z1) when looking from above with +y up (i.e. walls are listed clockwise).
  wall(x0, z0, x1, z1, y0, h, color, params, uOffset = 0) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz)
    const nx = -dz / L, nz = dx / L
    const c = new THREE.Color(color)
    // winding (p0b, p1b, p1t) faces n = (-dz, 0, dx)
    const quad = [[x0, y0, z0, 0, 0], [x1, y0, z1, L, 0], [x1, y0 + h, z1, L, h], [x0, y0, z0, 0, 0], [x1, y0 + h, z1, L, h], [x0, y0 + h, z0, 0, h]]
    for (const q of quad) {
      this.pos.push(q[0], q[1], q[2]); this.nor.push(nx, 0, nz); this.col.push(c.r, c.g, c.b)
      this.uv.push(q[3] + uOffset, q[4]); this.fac.push(params[0], params[1], params[2], params[3])
    }
  }

  // flat roof polygon (rect) at height y
  roof(x0, z0, x1, z1, y, color) {
    const c = new THREE.Color(color)
    const P = [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]]
    for (const [x, z] of P) { this.pos.push(x, y, z); this.nor.push(0, 1, 0); this.col.push(c.r, c.g, c.b); this.uv.push(x, z); this.fac.push(3, 3, 0, 0) }
  }

  // oriented box building: centre (cx,cz), size (w along local x, d along local z), height h, rotation ry
  // windows on all four walls; roof flat
  box(cx, cz, w, d, y0, h, ry, color, params, roofColor = 0x77736c, sides = [1, 1, 1, 1], plainStyle = 0) {
    const c = Math.cos(ry), s = Math.sin(ry)
    const P = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c]
    const hw = w / 2, hd = d / 2
    // corners clockwise seen from above (+y): front-left, front-right... walls face outward
    const A = P(-hw, hd), B = P(hw, hd), C = P(hw, -hd), D = P(-hw, -hd)
    const plain = [params[0], params[1], params[2], plainStyle]
    // A->B->C->D->A keeps every wall's normal pointing outward (front, right, back, left)
    this.wall(A[0], A[1], B[0], B[1], y0, h, color, sides[0] ? params : plain)
    this.wall(B[0], B[1], C[0], C[1], y0, h, color, sides[1] ? params : plain)
    this.wall(C[0], C[1], D[0], D[1], y0, h, color, sides[2] ? params : plain)
    this.wall(D[0], D[1], A[0], A[1], y0, h, color, sides[3] ? params : plain)
    // roof as two triangles (use rotated corners)
    const rc = new THREE.Color(roofColor)
    const tri = [A, B, C, A, C, D]
    for (let i = 0; i < 6; i++) { const p = tri[i]; this.pos.push(p[0], y0 + h, p[1]); this.nor.push(0, 1, 0); this.col.push(rc.r, rc.g, rc.b); this.uv.push(p[0], p[1]); this.fac.push(3, 3, 0, 0) }
  }

  get count() { return this.pos.length / 3 }

  build() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('facade', new THREE.Float32BufferAttribute(this.fac, 4))
    g.computeBoundingSphere(); g.computeBoundingBox()
    return g
  }
}

export function makeFacadeMaterial() {
  const tex = buildFacadeTextures()
  const L = FACADE_LAYERS
  // logical style slots, mirrored in the shader below
  const order = ['plain', 'roof', 'panel', 'panelGround', 'loggia', 'loggiaGround', 'shop', 'office', 'ruin', 'classical', 'brick', 'panelEnd']
  const fl = order.map((k) => new THREE.Vector3(L[k].first, L[k].count, L[k].avg))
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 })
  m.envMapIntensity = 0.6
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SHARED)
    shader.uniforms.uResolution = RES
    shader.uniforms.uFacadeTex = { value: tex }
    shader.uniforms.uFL = { value: fl }
    shader.vertexShader = `attribute vec4 facade;
flat varying vec4 vFacade;
varying vec2 vWallUv;
varying float vViewZ;
varying float vRoofN;
` + shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
  vFacade = facade;
  vWallUv = uv;
  vRoofN = normal.y;`).replace('#include <project_vertex>', `#include <project_vertex>
  vViewZ = -mvPosition.z;`)

    shader.fragmentShader = `flat varying vec4 vFacade;
varying vec2 vWallUv;
varying float vViewZ;
varying float vRoofN;
uniform float uNight;
uniform vec2 uCutCenter;
uniform float uCutRadius;
uniform float uCutDepth;
uniform float uCutAspect;
uniform float uCutOn;
uniform vec2 uResolution;
uniform highp sampler2DArray uFacadeTex;
uniform vec3 uFL[12];
// integer hash (pcg2d): exact per module, so a module never picks different variants pixel to pixel
uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v;
}
float fh1(vec2 p) {
  uvec2 h = pcg2d(uvec2(ivec2(floor(p * 8.0)) + ivec2(1 << 20)));
  return float(h.x & 0xffffffu) / 16777216.0;
}
float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}
` + shader.fragmentShader
      .replace('void main() {', `void main() {
  if (uCutOn > 0.5 && vViewZ < uCutDepth) {
    vec2 sp = gl_FragCoord.xy / uResolution;
    vec2 dd = (sp - uCutCenter) * vec2(uCutAspect, 1.0);
    float r = length(dd) / uCutRadius;
    float fade = 1.0 - smoothstep(0.82, 1.0, r);
    float depthK = smoothstep(0.0, 1.5, uCutDepth - vViewZ);
    if (fade * depthK > bayer4(gl_FragCoord.xy)) discard;
  }
  vec3 winEmit = vec3(0.0);
  float glassMask = 0.0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    float style = floor(vFacade.w + 0.5);
    float fh = vFacade.x, ws = vFacade.y, seed = vFacade.z;
    vec2 uvw = vWallUv;
    vec3 FL = uFL[0];
    vec2 msz = vec2(3.2, 2.8);
    vec2 org = vec2(0.0);
    float litP = 0.45;
    bool shopBand = false;
    if (vRoofN > 0.5) { FL = uFL[1]; msz = vec2(4.0); litP = 0.0; }
    else if (style < 0.5) { litP = 0.0; }
    else if (style < 1.5) { FL = uFL[2]; msz = vec2(ws, fh); }
    else if (style < 2.5) { FL = uFL[7]; msz = vec2(ws, fh); litP = 0.35; }
    else if (style < 3.5) { FL = uFL[8]; msz = vec2(ws, fh); litP = 0.0; }
    else if (style < 4.5) { FL = uFL[9]; msz = vec2(ws, fh); }
    else if (style < 5.5) {
      if (uvw.y < 4.2) { FL = uFL[6]; msz = vec2(3.0, 4.2); shopBand = true; litP = 0.75; }
      else { FL = uFL[2]; msz = vec2(ws, fh); org.y = 4.2; }
    }
    else if (style < 6.5) { FL = uFL[4]; msz = vec2(ws, fh); }
    else if (style < 7.5) { FL = uFL[10]; msz = vec2(ws, fh); }
    else if (style > 9.5) { FL = uFL[11]; msz = vec2(3.2, fh); litP = 0.0; }
    else {
      if (uvw.y < 4.2) { FL = uFL[6]; msz = vec2(ws, 4.2); shopBand = true; litP = 0.75; }
      else { FL = style < 8.5 ? uFL[9] : uFL[10]; msz = vec2(ws, fh); org.y = 4.2; }
    }
    vec2 g = (uvw - org) / msz;
    vec2 cell = floor(g);
    vec2 f = fract(g);
    if (style > 0.5 && style < 1.5 && cell.y < 0.5) FL = uFL[3];
    if (style > 5.5 && style < 6.5 && cell.y < 0.5) { FL = uFL[5]; litP = 0.0; }
    float h1 = fh1(cell + seed * 7.13);
    float h2 = fh1(cell * 1.37 + seed * 3.1 + 11.0);
    float layer = FL.x + min(floor(h1 * FL.y), FL.y - 1.0);
    vec2 dgx = dFdx(g), dgy = dFdy(g);
    vec2 fu = f;
    // mirror half the modules for variety (shop signs and graffiti excepted)
    if (h2 > 0.5 && !shopBand) { fu.x = 1.0 - fu.x; dgx.x = -dgx.x; dgy.x = -dgy.x; }
    vec4 tex = textureGrad(uFacadeTex, vec3(fu, layer), dgx, dgy);
    // far away the per-module variety would sparkle: fade into the style's average module
    float cellPx = max(length(dFdx(g)), length(dFdy(g)));
    float far = smoothstep(0.06, 0.2, cellPx);
    if (far > 0.001) tex = mix(tex, textureGrad(uFacadeTex, vec3(f, FL.z), dFdx(g), dFdy(g)), far);
    float kind = tex.a;
    float tint = smoothstep(0.84, 0.97, kind);
    float glassK = 1.0 - smoothstep(0.3, 0.55, kind);
    // wall areas take the building colour (texture is painted around a neutral grey)
    diffuseColor.rgb = mix(tex.rgb, tex.rgb * diffuseColor.rgb * 2.85, tint);
    float litCell = step(1.0 - litP, fh1(cell * 2.31 + seed + 5.0));
    float lit = mix(litCell, litP, far) * uNight;
    vec3 warm = mix(vec3(1.0, 0.7, 0.4), vec3(1.0, 0.86, 0.64), fh1(cell + 3.3));
    if (shopBand) warm = vec3(1.0, 0.93, 0.8);
    winEmit = glassK * lit * mix(warm, tex.rgb * 2.4 + warm * 0.25, 0.3) * 1.5;
    glassMask = glassK * (1.0 - far) * (1.0 - uNight * 0.6);
  }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.12, glassMask);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += winEmit;`)
  }
  m.customProgramCacheKey = () => 'facade-v3'
  return m
}
