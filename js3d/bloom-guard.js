/* ブルーム (発光) の前に置く段。壊れた値 (NaN / 無限大) を 0 にし、明るすぎる値を抑える。
   iPhone などでは、金属の照り返しなどの計算が1点だけ NaN / 無限大になることがある。
   それがブルームの縮小とぼかしで広がり、画面に青白い四角 (モザイクのような板) が出ていた (2026-10-29、ストーリーの所長室)。
   NaN の判定は x != x だと最適化で消されることがあるので、ビット列で見る */
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';

export function bloomGuardPass() {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        bvec4 bad = equal(floatBitsToUint(c) & uvec4(0x7f800000u), uvec4(0x7f800000u));
        c = mix(c, vec4(0.0), vec4(bad));
        gl_FragColor = clamp(c, 0.0, 16.0);
      }`
  });
}
