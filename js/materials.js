// Shared material registry. Textures are (re)assigned when graphics quality changes.
import * as THREE from 'three';

const U = { uTime: { value: 0 } };
export const sharedUniforms = U;

function wind(mat, amp, kind) {
  mat.customProgramCacheKey = () => 'wind_' + kind + amp;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uTime = U.uTime;
    let body;
    if (kind === 'grass') {
      body = `
      #ifdef USE_INSTANCING
        vec3 wip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
      #else
        vec3 wip = vec3(0.0);
      #endif
      float wph = uTime * 1.6 + wip.x * 0.21 + wip.z * 0.17;
      float gust = sin(uTime * 0.37 + wip.x * 0.03) * 0.5 + 0.7;
      float wh = position.y * position.y;
      transformed.x += (sin(wph) * 0.55 + sin(wph * 2.7) * 0.2) * ${amp.toFixed(3)} * wh * gust;
      transformed.z += (cos(wph * 0.8) * 0.35) * ${amp.toFixed(3)} * wh * gust;`;
    } else {
      body = `
      vec3 wwp = (modelMatrix * vec4(position, 1.0)).xyz;
      #ifdef USE_INSTANCING
        wwp += vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
      #endif
      float lph = uTime * 2.2 + wwp.x * 0.7 + wwp.y * 0.9 + wwp.z * 0.6;
      float lf = max(0.0, position.y - 1.0) * 0.08;
      transformed.x += sin(lph) * ${amp.toFixed(3)} * (0.5 + lf);
      transformed.y += cos(lph * 1.3) * ${amp.toFixed(3)} * 0.5;
      transformed.z += sin(lph * 0.7 + 1.0) * ${amp.toFixed(3)} * (0.5 + lf);`;
    }
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + body);
  };
  return mat;
}

export class Materials {
  constructor() {
    const S = (o) => new THREE.MeshStandardMaterial(o);
    const m = this.m = {};
    m.cobble = S({ roughness: 0.82 });
    m.pavers = S({ roughness: 0.9 });
    m.plaster = S({ roughness: 0.95, vertexColors: true });
    m.brick = S({ roughness: 0.92, vertexColors: true });
    m.roof = S({ roughness: 0.78, vertexColors: true, side: THREE.DoubleSide });
    m.stone = S({ roughness: 0.78, vertexColors: true });
    m.blocks = S({ roughness: 0.9, vertexColors: true });
    m.wood = S({ roughness: 0.75, vertexColors: true });
    m.shutter = S({ roughness: 0.62, vertexColors: true });
    m.iron = S({ color: 0x2b2b2e, metalness: 0.65, roughness: 0.45 });
    m.copper = S({ color: 0x8c5d3e, metalness: 0.75, roughness: 0.42 });
    m.glass = S({ roughness: 0.08, metalness: 0.05, envMapIntensity: 1.6 });
    m.shopGlass = S({ roughness: 0.12, metalness: 0.0, emissive: new THREE.Color(0xffe0b0), emissiveIntensity: 0.55, envMapIntensity: 1.2 });
    m.awning = S({ roughness: 0.92, alphaTest: 0.5, side: THREE.DoubleSide });
    m.railing = S({ metalness: 0.55, roughness: 0.5, alphaTest: 0.5, side: THREE.DoubleSide, color: 0x555555 });
    m.signs = S({ roughness: 0.55 });
    m.ghost = S({ roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.posters = S({ roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    m.clock = S({ roughness: 0.6 });
    m.rose = S({ roughness: 0.25, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.25 });
    m.lampGlass = S({ color: 0xfff1d0, emissive: new THREE.Color(0xffc670), emissiveIntensity: 1.6, roughness: 0.3 });
    m.terrain = S({ roughness: 0.95, vertexColors: true });
    m.dirt = S({ roughness: 0.95, vertexColors: true });
    m.bark = S({ roughness: 0.95, vertexColors: true });
    m.leafBroad = wind(S({ alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.82, vertexColors: true }), 0.035, 'leaf');
    m.leafOlive = wind(S({ alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, color: 0xc4cfa4, vertexColors: true }), 0.03, 'leaf');
    m.leafNeedle = wind(S({ alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85, color: 0xa6b892, vertexColors: true }), 0.02, 'leaf');
    m.foliageLo = S({ roughness: 1, vertexColors: true });
    m.rock = S({ roughness: 0.92, vertexColors: true });
    m.hay = S({ roughness: 1, vertexColors: true });
    m.water = S({ color: 0x356f7a, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.86, envMapIntensity: 1.8 });
    m.grassBlade = wind(S({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), 0.42, 'grass');
    m.flower = wind(S({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }), 0.42, 'grass');
    m.paint = S({ vertexColors: true, roughness: 0.7, metalness: 0.0 });
    m.carPaint = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 });
    m.carGlass = S({ color: 0x141a22, roughness: 0.04, metalness: 0.3, envMapIntensity: 2 });
    m.rubber = S({ color: 0x18181a, roughness: 0.95 });
    m.chrome = S({ color: 0xdedede, metalness: 1, roughness: 0.18 });
    m.terracotta = S({ color: 0xb5562f, roughness: 0.85, vertexColors: true });
    m.cloth = S({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    m.bellBronze = S({ color: 0x9a7a3a, metalness: 0.9, roughness: 0.35 });
    this.terrainUniforms = { dirtMap: { value: null }, dirtScale: { value: 1.4 } };
    this._terrainShader();
    for (const k in m) m[k].name = k;
  }

  _terrainShader() {
    const tu = this.terrainUniforms;
    const mat = this.m.terrain;
    mat.customProgramCacheKey = () => 'terrainSplat';
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.dirtMap = tu.dirtMap;
      sh.uniforms.dirtScale = tu.dirtScale;
      sh.vertexShader = 'attribute float splat;\nvarying float vSplat;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;');
      sh.fragmentShader = 'uniform sampler2D dirtMap;\nuniform float dirtScale;\nvarying float vSplat;\n' +
        sh.fragmentShader.replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, vMapUv );
          vec4 dirtC = texture2D( dirtMap, vMapUv * dirtScale );
          float sp = smoothstep(0.15, 0.85, vSplat + (sampledDiffuseColor.g - 0.3) * 0.6);
          sampledDiffuseColor = mix(sampledDiffuseColor, dirtC, sp);
          diffuseColor *= sampledDiffuseColor;
        #endif`);
    };
  }

  applyTextures(t, gfx) {
    const m = this.m;
    const set = (mat, surf, ns = 1) => {
      if (!surf) return;
      mat.map = surf.map || surf;
      if (surf.normalMap) { mat.normalMap = surf.normalMap; mat.normalScale = new THREE.Vector2(ns, ns); }
      mat.needsUpdate = true;
    };
    set(m.cobble, t.cobble, 1.1); set(m.pavers, t.pavers, 0.9); set(m.plaster, t.plaster, 0.9);
    set(m.brick, t.brick, 1); set(m.roof, t.roof, 1.2); set(m.stone, t.stone, 0.8); set(m.blocks, t.blocks, 1.1);
    set(m.wood, t.wood, 0.9); set(m.shutter, t.shutter, 1); set(m.terrain, t.grass, 0.9); set(m.dirt, t.dirt, 1);
    set(m.bark, t.bark, 1.2); set(m.rock, t.rock, 1.2); set(m.hay, t.hay, 1);
    m.iron.map = t.metal.map; m.iron.normalMap = t.metal.normalMap; m.iron.needsUpdate = true;
    m.glass.map = t.windows; m.glass.needsUpdate = true;
    m.shopGlass.map = t.shops; m.shopGlass.emissiveMap = t.shops; m.shopGlass.needsUpdate = true;
    m.awning.map = t.awning; m.awning.needsUpdate = true;
    t.railing.wrapT = THREE.ClampToEdgeWrapping;
    m.railing.map = t.railing; m.railing.needsUpdate = true;
    m.signs.map = t.signs; m.signs.needsUpdate = true;
    m.ghost.map = t.ghost; m.ghost.needsUpdate = true;
    m.posters.map = t.posters; m.posters.needsUpdate = true;
    m.clock.map = t.clock; m.clock.needsUpdate = true;
    m.rose.map = t.rose; m.rose.emissiveMap = t.rose; m.rose.needsUpdate = true;
    m.leafBroad.map = t.leafBroad; m.leafOlive.map = t.leafOlive; m.leafNeedle.map = t.leafNeedle;
    m.leafBroad.needsUpdate = m.leafOlive.needsUpdate = m.leafNeedle.needsUpdate = true;
    m.water.normalMap = t.waterNormal; m.water.normalScale = new THREE.Vector2(0.35, 0.35); m.water.needsUpdate = true;
    m.cloth.map = t.fabric.map; m.cloth.needsUpdate = true;
    set(m.foliageLo, t.foliage, 1.2);
    m.foliageLo.color.setRGB(1.35, 1.35, 1.35);
    this.terrainUniforms.dirtMap.value = t.dirt.map;
    this.tex = t;
  }

  update(dt, time) {
    U.uTime.value = time;
    if (this.tex && this.tex.waterNormal) { this.tex.waterNormal.offset.x = time * 0.02; this.tex.waterNormal.offset.y = time * 0.013; }
  }
}
