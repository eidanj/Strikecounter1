// Renderer + post-processing chain configured per graphics preset:
//   world pass -> (GTAO) -> viewmodel pass -> (bloom) -> tonemap -> grade -> (FXAA/SMAA)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, saturation: { value: 1.08 }, contrast: { value: 1.05 }, vignette: { value: 0.32 }, warmth: { value: 0.03 }, lowHp: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float saturation, contrast, vignette, warmth, lowHp; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, saturation * (1.0 - lowHp * 0.6));
      col = (col - 0.5) * contrast + 0.5;
      col *= vec3(1.0 + warmth, 1.0 + warmth * 0.35, 1.0 - warmth * 0.6);
      vec2 d = vUv - 0.5; float v = 1.0 - dot(d, d) * vignette * 2.2;
      col *= clamp(v, 0.0, 1.0);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

export class Renderer {
  constructor(canvas) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = 1.0;
    this.r.shadowMap.enabled = true;
    this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.composer = null; this.gfx = null;
  }

  configure(gfx, scene, camera, vm) {
    this.gfx = gfx; this.scene = scene; this.camera = camera; this.vm = vm;
    this.r.setPixelRatio(gfx.pixelRatio);
    this.r.setSize(innerWidth, innerHeight, false);
    if (this.composer) { this.composer.dispose(); this.composer = null; }
    this.passes = {};
    if (!gfx.post) return;
    const size = this.r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: gfx.aa === 'smaa' && gfx.pixelRatio > 1.4 ? 0 : 0 });
    const c = this.composer = new EffectComposer(this.r, rt);
    c.setPixelRatio(gfx.pixelRatio); c.setSize(innerWidth, innerHeight);
    c.addPass(new RenderPass(scene, camera));
    if (gfx.ao) {
      const ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 0.85;
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1.0, samples: gfx.pixelRatio > 1.6 ? 12 : 16 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      // GTAO re-renders the scene with its own material, which ignores colorWrite /
      // alphaTest. Skip anything flagged hideFromAO (the first-person body around the
      // camera, sprites, alpha-cut foliage, transparent FX) so it can't smear the sky.
      const baseOverride = ao.overrideVisibility.bind(ao);
      ao.overrideVisibility = function () {
        baseOverride();
        this.scene.traverse((o) => { if (o.userData.hideFromAO) o.visible = false; });
      };
      c.addPass(ao); this.passes.ao = ao;
    }
    const vmPass = new RenderPass(vm.scene, vm.camera);
    vmPass.clear = false; vmPass.clearDepth = true;
    c.addPass(vmPass); this.passes.vm = vmPass;
    if (gfx.bloom) {
      const b = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.55, 0.9);
      c.addPass(b); this.passes.bloom = b;
    }
    c.addPass(new OutputPass());
    if (gfx.grade) { const g = new ShaderPass(GradeShader); c.addPass(g); this.passes.grade = g; }
    if (gfx.aa === 'fxaa') {
      const f = new ShaderPass(FXAAShader);
      f.material.uniforms.resolution.value.set(1 / size.x, 1 / size.y);
      c.addPass(f); this.passes.fxaa = f;
    } else if (gfx.aa === 'smaa') {
      const s = new SMAAPass(size.x, size.y); c.addPass(s); this.passes.smaa = s;
    }
  }

  resize() {
    if (!this.gfx) return;
    this.r.setSize(innerWidth, innerHeight, false);
    if (this.composer) {
      this.composer.setSize(innerWidth, innerHeight);
      const size = this.r.getDrawingBufferSize(new THREE.Vector2());
      if (this.passes.fxaa) this.passes.fxaa.material.uniforms.resolution.value.set(1 / size.x, 1 / size.y);
      if (this.passes.ao) this.passes.ao.setSize(size.x, size.y);
    }
  }

  setLowHp(v) { if (this.passes && this.passes.grade) this.passes.grade.uniforms.lowHp.value = v; }

  render(showVM) {
    if (this.passes && this.passes.vm) this.passes.vm.enabled = showVM;
    if (this.composer) { this.composer.render(); return; }
    const r = this.r;
    r.autoClear = true;
    r.render(this.scene, this.camera);
    if (showVM) { r.autoClear = false; r.clearDepth(); r.render(this.vm.scene, this.vm.camera); r.autoClear = true; }
  }
}
