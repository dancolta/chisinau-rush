import * as THREE from 'three'
import { SHARED, RES } from '../render/Materials.js'

// Procedural facade material: windows, panel seams and night-lit rooms are
// computed in the fragment shader from wall-space UVs (metres), so a whole
// 9-storey panel block costs a few dozen vertices.
//
// Per-vertex attributes:
//   uv       wall-space coords (u = metres along wall, v = metres above base)
//   facade   vec4(floorH, winSpacing, seed, style)
//            style 0 = plain wall, 1 = panel block, 2 = office ribbon windows,
//                  3 = ruin (dark/broken), 4 = classical tall windows, 5 = shopfront ground floor + panel above
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
  box(cx, cz, w, d, y0, h, ry, color, params, roofColor = 0x77736c, sides = [1, 1, 1, 1]) {
    const c = Math.cos(ry), s = Math.sin(ry)
    const P = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c]
    const hw = w / 2, hd = d / 2
    // corners clockwise seen from above (+y): front-left, front-right... walls face outward
    const A = P(-hw, hd), B = P(hw, hd), C = P(hw, -hd), D = P(-hw, -hd)
    const plain = [params[0], params[1], params[2], 0]
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
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })
  m.envMapIntensity = 0.5
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SHARED)
    shader.uniforms.uResolution = RES
    shader.vertexShader = `attribute vec4 facade;
varying vec4 vFacade;
varying vec2 vWallUv;
varying float vViewZ;
` + shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
  vFacade = facade;
  vWallUv = uv;`).replace('#include <project_vertex>', `#include <project_vertex>
  vViewZ = -mvPosition.z;`)

    shader.fragmentShader = `varying vec4 vFacade;
varying vec2 vWallUv;
varying float vViewZ;
uniform float uNight;
uniform vec2 uCutCenter;
uniform float uCutRadius;
uniform float uCutDepth;
uniform float uCutAspect;
uniform float uCutOn;
uniform vec2 uResolution;
float fh1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
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
    float fade = 1.0 - smoothstep(0.55, 1.0, r);
    float depthK = smoothstep(0.0, 6.0, uCutDepth - vViewZ);
    if (fade * depthK * 0.92 > bayer4(gl_FragCoord.xy)) discard;
  }
  vec3 winEmit = vec3(0.0);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    float style = floor(vFacade.w + 0.5);
    if (style > 5.5) {
      // balcony / loggia stack: every floor randomly open, railed or glazed with mismatched frames
      float fh = vFacade.x, seed = vFacade.z;
      float fl = floor(vWallUv.y / fh), fy = fract(vWallUv.y / fh);
      float ra = fh1(vec2(fl, seed)), rb = fh1(vec2(fl * 3.1 + 1.0, seed + 5.0)), rc = fh1(vec2(fl * 7.7, seed + 9.0));
      vec3 wall = diffuseColor.rgb;
      vec3 frameC = rc < 0.3 ? vec3(0.9, 0.9, 0.88) : rc < 0.45 ? vec3(0.52, 0.4, 0.3) : rc < 0.65 ? vec3(0.7, 0.71, 0.72) : rc < 0.82 ? vec3(0.82, 0.79, 0.7) : rc < 0.92 ? vec3(0.5, 0.56, 0.62) : vec3(0.68, 0.52, 0.44);
      vec3 parC = ra < 0.5 ? wall * 1.02 : ra < 0.75 ? mix(wall, frameC, 0.7) : vec3(0.3, 0.31, 0.33);
      bool glazed = rb > 0.4;
      vec3 col;
      float winK = 0.0;
      if (fy < 0.05 || fl < 0.5) col = wall * 0.8;
      else if (fy < 0.4) {
        col = parC;
        if (ra >= 0.7) col = mix(col, vec3(0.12), step(0.5, fract(vWallUv.x * 6.0)) * 0.6); // metal railing bars
      } else if (glazed) {
        float mull = 1.0 - step(0.06, fract(vWallUv.x / 0.75)) ;
        float tr = 1.0 - step(0.08, abs(fy - 0.43));
        col = mix(vec3(0.16, 0.2, 0.26) + rb * 0.08, frameC, max(mull, tr));
        winK = (1.0 - max(mull, tr));
      } else {
        col = vec3(0.09, 0.09, 0.1) + wall * 0.08; // open loggia, dark interior
        winK = 0.6;
      }
      float lit = step(0.6, fh1(vec2(fl * 1.9, seed + 2.0))) * uNight;
      vec3 em = winK * lit * mix(vec3(1.0, 0.74, 0.42), vec3(1.0, 0.9, 0.7), rc) * 1.2;
      // distance anti-aliasing: blend toward the average look when floors get tiny on screen
      float aaB = smoothstep(0.18, 0.5, fwidth(vWallUv.y / fh));
      col = mix(col, mix(wall * 0.9, vec3(0.2, 0.22, 0.26), 0.35), aaB);
      em = mix(em, vec3(1.0, 0.8, 0.5) * 0.2 * uNight, aaB);
      diffuseColor.rgb = col;
      winEmit = em;
    } else if (style > 0.5) {
      float fh = vFacade.x, ws = vFacade.y, seed = vFacade.z;
      vec2 uvw = vWallUv;
      float groundH = (style > 4.5) ? 4.2 : 0.0;
      vec2 g = vec2(uvw.x / ws, (uvw.y - groundH) / fh);
      vec2 cell = floor(g);
      vec2 f = fract(g);
      float r1 = fh1(cell + seed * 7.13);
      float r2 = fh1(cell * 1.37 + seed * 3.1 + 11.0);
      vec3 wall = diffuseColor.rgb;
      // panel seams and slight per-panel tint variation (panel blocks)
      if (style < 1.5 || style > 4.5) {
        float seam = max(1.0 - smoothstep(0.0, 0.035, f.y), 1.0 - smoothstep(0.0, 0.02, fract(uvw.x / (ws * 2.0))));
        wall *= 1.0 - 0.13 * seam;
        wall *= 0.965 + 0.06 * fh1(floor(vec2(uvw.x / (ws * 2.0), g.y)) + seed);
        // rust / water stains under some windows
        float stain = step(0.82, fh1(vec2(cell.x, 0.0) + seed)) * smoothstep(0.35, 0.0, f.y) * smoothstep(0.1, 0.5, abs(f.x - 0.5));
        wall *= 1.0 - 0.08 * stain;
      }
      float wx0 = 0.2, wx1 = 0.8, wy0 = 0.3, wy1 = 0.84;
      if (style > 1.5 && style < 2.5) { wx0 = 0.03; wx1 = 0.97; wy0 = 0.25; wy1 = 0.8; }
      if (style > 3.5 && style < 4.5) { wx0 = 0.3; wx1 = 0.7; wy0 = 0.18; wy1 = 0.9; }
      float inX = step(wx0, f.x) * step(f.x, wx1);
      float inY = step(wy0, f.y) * step(f.y, wy1);
      float inWin = inX * inY * step(0.0, g.y);
      // don't draw windows in the top parapet band
      float top = vWallUv.y;
      // frame: thin border around the glass
      float fx = min(f.x - wx0, wx1 - f.x) * ws, fy = min(f.y - wy0, wy1 - f.y) * fh;
      float frame = inWin * (1.0 - step(0.07, min(fx, fy)));
      vec3 glass = mix(vec3(0.08, 0.1, 0.13), vec3(0.16, 0.2, 0.25), r1);
      // curtains / different glazing
      glass = mix(glass, vec3(0.3, 0.24, 0.2), step(0.9, r2) * 0.45);
      float lit = step(0.52, r2) * uNight;
      if (style > 2.5 && style < 3.5) { glass = vec3(0.03); lit = 0.0; wall *= 0.85; if (r1 > 0.7) glass = vec3(0.18, 0.16, 0.14); }
      vec3 col = mix(wall, glass, inWin);
      col = mix(col, mix(wall, vec3(0.92, 0.92, 0.9), 0.6), frame * 0.7);
      // ground floor shopfront band
      if (style > 4.5 && uvw.y < groundH) {
        float band = step(0.6, uvw.y) * step(uvw.y, 3.4);
        float mull = step(0.06, fract(uvw.x / 3.0));
        col = mix(wall * 0.8, vec3(0.12, 0.16, 0.2), band * mull);
        lit = band * mull * uNight * step(0.3, fh1(vec2(floor(uvw.x / 6.0), seed)));
        inWin = band * mull;
      }
      vec3 warm = mix(vec3(1.0, 0.72, 0.4), vec3(1.0, 0.86, 0.62), r1);
      vec3 cool = vec3(0.62, 0.78, 1.0);
      vec3 em = inWin * (1.0 - frame) * lit * mix(warm, cool, step(0.9, r1)) * 1.35;
      // distance anti-aliasing: fade the window grid into its average colour
      float cellPx = max(fwidth(g.x), fwidth(g.y));
      float aa = smoothstep(0.2, 0.55, cellPx);
      float area = (wx1 - wx0) * (wy1 - wy0);
      col = mix(col, mix(wall, vec3(0.12, 0.14, 0.18), area * 0.85), aa);
      em = mix(em, vec3(1.0, 0.78, 0.5) * area * 0.55 * uNight * (style > 2.5 && style < 3.5 ? 0.0 : 1.0), aa);
      diffuseColor.rgb = col;
      winEmit = em;
    }
  }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += winEmit;`)
  }
  m.customProgramCacheKey = () => 'facade-v2'
  return m
}
