// Custom sky dome (gradient + sun + drifting clouds) that exactly matches
// the distance-fog colour at the horizon, plus sun/hemisphere lighting.
import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.62, 0.52, 0.42).normalize();
export const HORIZON = new THREE.Color(0xd6dde0);
export const ZENITH = new THREE.Color(0x4f86c6);

const vert = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // keep at far plane
}`;

const frag = `
uniform vec3 sunDir; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 groundCol; uniform vec3 sunCol;
uniform float time; uniform float cloudAmt;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5));
  col = mix(col, groundCol, smoothstep(0.0, -0.2, h));
  float sd = max(dot(d, sunDir), 0.0);
  col += sunCol * (pow(sd, 6.0) * 0.35 + pow(sd, 48.0) * 0.8);
  col += vec3(1.0, 0.93, 0.8) * smoothstep(0.99955, 0.9998, sd) * 30.0;
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.1) * 0.55 + vec2(time * 0.006, time * 0.002);
    float n = fbm(uv * 1.3);
    float m = smoothstep(0.52 - cloudAmt * 0.2, 0.85, n) * smoothstep(0.0, 0.22, h);
    float shade = smoothstep(0.55, 0.95, fbm(uv * 1.3 + vec2(0.07, 0.05)));
    vec3 cc = mix(vec3(1.02, 0.99, 0.95), vec3(0.72, 0.74, 0.8), shade * 0.8);
    cc += sunCol * pow(sd, 5.0) * 0.7;
    col = mix(col, cc, m * 0.9);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSky() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      sunDir: { value: SUN_DIR.clone() }, zenith: { value: ZENITH.clone() }, horizon: { value: HORIZON.clone() },
      groundCol: { value: new THREE.Color(0x8a8f86) }, sunCol: { value: new THREE.Color(0xffc98a) },
      time: { value: 0 }, cloudAmt: { value: 0.6 },
    },
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.scale.setScalar(900);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

export function createLights(scene) {
  const sun = new THREE.DirectionalLight(0xffe2c2, 3.1);
  sun.position.copy(SUN_DIR).multiplyScalar(150);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbcd3f2, 0x7d6c52, 0.55);
  scene.add(hemi);
  return { sun, hemi };
}

export function buildEnvironment(renderer, skyMesh) {
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const m = skyMesh.clone(); m.material = skyMesh.material.clone();
  m.material.uniforms.cloudAmt.value = 0.3;
  m.scale.setScalar(100);
  s.add(m);
  // ground bounce plane so reflections show warm ground below horizon
  const g = new THREE.Mesh(new THREE.CircleGeometry(80, 32), new THREE.MeshBasicMaterial({ color: 0x8b7a60 }));
  g.rotation.x = -Math.PI / 2; g.position.y = -2; s.add(g);
  const rt = pm.fromScene(s, 0.02, 0.1, 400);
  pm.dispose();
  m.material.dispose(); g.geometry.dispose(); g.material.dispose();
  return rt.texture;
}
