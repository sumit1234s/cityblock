import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { lerp } from '../lib/util.js';

/**
 * Per-era film grade. 1945 is desaturated sepia with heavy grain, 1965 is
 * bright and saturated, 1985 leans magenta with bloom and scanlines, 2005 is
 * flat and cool, 2025 is warm, 2055 is cold with chromatic fringing.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1 },
    uContrast: { value: 1 },
    uLift: { value: 0 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uGrain: { value: 0.08 },
    uVignette: { value: 0.4 },
    uChroma: { value: 0 },
    uScan: { value: 0 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(0x9fd8ff) },
    uWarp: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,
  fragmentShader: `
uniform sampler2D tDiffuse;
uniform float uSaturation, uContrast, uLift, uGrain, uVignette, uChroma, uScan, uTime, uFlash, uWarp;
uniform vec3 uTint;
uniform vec3 uFlashColor;
uniform vec2 uResolution;
varying vec2 vUv;

float hash( vec2 p ) { return fract( sin( dot( p, vec2(127.1,311.7) ) ) * 43758.5453 ); }

void main() {
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float r2 = dot( c, c );

  // barrel warp during a time jump
  uv = 0.5 + c * ( 1.0 + uWarp * r2 * 1.6 );

  // chromatic aberration
  vec3 col;
  float ca = uChroma + uWarp * 0.01;
  if ( ca > 0.00001 ) {
    col.r = texture2D( tDiffuse, uv + c * ca * 2.0 ).r;
    col.g = texture2D( tDiffuse, uv ).g;
    col.b = texture2D( tDiffuse, uv - c * ca * 2.0 ).b;
  } else {
    col = texture2D( tDiffuse, uv ).rgb;
  }

  // grade
  float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
  col = mix( vec3( l ), col, uSaturation );
  col = ( col - 0.5 ) * uContrast + 0.5;
  col += uLift;
  col *= uTint;

  // scanlines (CRT-ish, subtle)
  if ( uScan > 0.001 ) {
    float s = sin( uv.y * uResolution.y * 1.5 ) * 0.5 + 0.5;
    col *= 1.0 - uScan * s;
  }

  // vignette
  float v = smoothstep( 0.85, 0.18, r2 * 1.6 );
  col *= mix( 1.0, v, uVignette );

  // grain
  float g = hash( uv * uResolution.xy + fract( uTime ) * 137.0 ) - 0.5;
  col += g * uGrain * ( 1.0 - l * 0.55 );

  // time-jump flash
  col += uFlashColor * uFlash;

  gl_FragColor = vec4( max( col, 0.0 ), 1.0 );
}`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();

    this.composer = new EffectComposer(renderer);
    this.composer.setSize(size.x, size.y);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.4, 0.7, 0.85);
    this.composer.addPass(this.bloom);

    this.output = new OutputPass();
    this.composer.addPass(this.output);

    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uResolution.value.set(size.x * pr, size.y * pr);
    this.composer.addPass(this.grade);

    this.enabled = true;
    this.target = null;
    this.time = 0;
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.grade.uniforms.uResolution.value.set(w * pr, h * pr);
  }

  /** Snap or blend the grade between two eras. */
  applyGrade(a, b = null, t = 1) {
    const g = this.grade.uniforms;
    const m = (k) => (b ? lerp(a.grade[k], b.grade[k], t) : a.grade[k]);
    g.uSaturation.value = m('saturation');
    g.uContrast.value = m('contrast');
    g.uLift.value = m('lift');
    g.uGrain.value = m('grain');
    g.uVignette.value = m('vignette');
    g.uChroma.value = m('chroma');
    g.uScan.value = m('scan');
    const ta = a.grade.tint;
    if (b) {
      const tb = b.grade.tint;
      g.uTint.value.set(lerp(ta[0], tb[0], t), lerp(ta[1], tb[1], t), lerp(ta[2], tb[2], t));
    } else {
      g.uTint.value.set(ta[0], ta[1], ta[2]);
    }
    this.bloom.strength = m('bloom');
    this.bloom.threshold = m('bloomThreshold');
    this.bloom.radius = 0.75;
  }

  setQuality(level) {
    // 0 = low (no bloom), 1 = medium, 2 = high
    this.bloom.enabled = level > 0;
    this.grade.uniforms.uGrain.value *= level > 0 ? 1 : 0.5;
  }

  flash(amount, color) {
    this.grade.uniforms.uFlash.value = amount;
    if (color !== undefined) this.grade.uniforms.uFlashColor.value.set(color);
  }
  warp(amount) {
    this.grade.uniforms.uWarp.value = amount;
  }

  render(dt) {
    this.time += dt;
    this.grade.uniforms.uTime.value = this.time;
    if (this.enabled) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
