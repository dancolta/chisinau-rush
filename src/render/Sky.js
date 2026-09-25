import * as THREE from 'three'

// Procedural sky dome: gradient + sun/moon + glowing clouds + stars.
// Everything is driven by TimeOfDay through uniforms.
const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`

const frag = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec3 uMoonDir;
uniform float uSunDisc;
uniform float uStars;
uniform float uTime;
uniform float uCloud;
uniform float uMoon;
varying vec3 vDir;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float up = clamp(h, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(up, 0.5));
  col = mix(col, uBottom, smoothstep(0.02, -0.3, h));

  float sd = max(dot(d, uSunDir), 0.0);
  // broad scattering around the sun + tight glow + disc
  col += uSunColor * (pow(sd, 6.0) * 0.28 + pow(sd, 48.0) * 0.55);
  col += uSunColor * smoothstep(1.0 - uSunDisc, 1.0 - uSunDisc * 0.55, sd) * 3.0;
  // horizon haze band, warmer toward the sun
  col += uSunColor * 0.16 * exp(-abs(h) * 9.0) * (0.35 + 0.65 * pow(sd, 2.0));

  // moon
  float md = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.75, 0.82, 1.0) * uMoon * (smoothstep(0.99955, 0.9997, md) * 1.6 + pow(md, 200.0) * 0.25);

  // stars
  if (uStars > 0.001 && h > 0.0) {
    vec3 sp = floor(d * 380.0);
    float s = hash3(sp);
    float star = step(0.9982, s) * smoothstep(0.0, 0.35, h);
    float tw = 0.65 + 0.35 * sin(uTime * 2.3 + s * 311.0);
    col += vec3(0.9, 0.95, 1.0) * star * tw * uStars * 1.4;
  }

  // clouds: stretched streaks like dusk stratocumulus
  if (uCloud > 0.001 && h > -0.02) {
    vec2 uv = d.xz / (h + 0.12);
    uv = vec2(uv.x * 0.55, uv.y * 1.35) + vec2(uTime * 0.004, uTime * 0.0015);
    float c = fbm(uv * 0.9);
    float c2 = fbm(uv * 2.7 + 3.1);
    float dens = smoothstep(0.5 - uCloud * 0.22, 0.78, c * 0.75 + c2 * 0.35);
    dens *= smoothstep(-0.02, 0.18, h) * (1.0 - smoothstep(0.55, 0.95, h) * 0.6);
    float lit = pow(sd, 3.0) * 0.8 + 0.2 + (1.0 - up) * 0.35;
    vec3 cc = mix(uCloudShade, uCloudLit, clamp(lit + (c2 - 0.5) * 0.6, 0.0, 1.0));
    col = mix(col, cc, dens * 0.92);
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export class Sky {
  constructor() {
    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() },
      uCloudShade: { value: new THREE.Color() },
      uSunDisc: { value: 0.0009 },
      uStars: { value: 0 },
      uMoon: { value: 0 },
      uTime: { value: 0 },
      uCloud: { value: 0.6 },
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -1000
    this.mesh.name = 'sky'
  }

  follow(camera) { this.mesh.position.copy(camera.position) }
}
