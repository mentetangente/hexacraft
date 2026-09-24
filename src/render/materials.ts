import * as THREE from 'three';

// Material único para el mundo: `RawShaderMaterial` con `sampler2DArray`.
// Un uniforme `uUseTexture` (0/1) alterna entre texturas y colores planos, así
// se comparte la misma geometría entre los dos modos sin remallar.
// La niebla es lineal (uFogNear .. uFogFar) y se calcula en el fragment.
// El agua reutiliza los mismos shaders con `uOpacity < 1`, `transparent` y
// `depthWrite: false`.

const VERTEX_SHADER = /* glsl */ `
precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in vec3 position;
in vec2 uv;
in float layer;
in vec4 blockColor;  // rgb = color base; a = sombreado por orientación (0..1)

out vec2 vUv;
out float vLayer;
out vec3 vBlockColor;
out float vShade;
out float vFogDepth;

void main() {
  vUv = uv;
  vLayer = layer;
  vBlockColor = blockColor.rgb;
  vShade = blockColor.a;
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mvPos.z;
  gl_Position = projectionMatrix * mvPos;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;
precision highp sampler2DArray;

uniform sampler2DArray uMap;
uniform float uUseTexture;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uOpacity;

in vec2 vUv;
in float vLayer;
in vec3 vBlockColor;
in float vShade;
in float vFogDepth;

out vec4 fragColor;

void main() {
  vec4 tex = texture(uMap, vec3(vUv, vLayer));
  vec3 base = mix(vBlockColor, tex.rgb, uUseTexture);
  vec3 rgb = base * vShade;
  float fog = clamp((vFogDepth - uFogNear) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
  rgb = mix(rgb, uFogColor, fog);
  float alpha = mix(tex.a * uOpacity, 1.0, fog);
  fragColor = vec4(rgb, alpha);
}
`;

export interface WorldMaterials {
  readonly opaque: THREE.RawShaderMaterial;
  readonly water: THREE.RawShaderMaterial;
  setUseTexture(on: boolean): void;
  setFog(color: THREE.Color, near: number, far: number): void;
  setWireframe(on: boolean): void;
  dispose(): void;
}

export function createWorldMaterials(texture: THREE.DataArrayTexture): WorldMaterials {
  // Uniforms compartidos entre opaque y water. Cambiar cualquiera desde los
  // setters afecta a ambos materiales al mismo tiempo.
  const uMap = { value: texture as THREE.DataArrayTexture };
  const uUseTexture = { value: 1.0 };
  const uFogColor = { value: new THREE.Color(0x88b4e0) };
  const uFogNear = { value: 40 };
  const uFogFar = { value: 64 };

  const opaqueUniforms = {
    uMap,
    uUseTexture,
    uFogColor,
    uFogNear,
    uFogFar,
    uOpacity: { value: 1.0 },
  };
  const waterUniforms = {
    uMap,
    uUseTexture,
    uFogColor,
    uFogNear,
    uFogFar,
    uOpacity: { value: 0.7 },
  };

  const opaque = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: opaqueUniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });
  const water = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: waterUniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  return {
    opaque,
    water,
    setUseTexture(on) {
      uUseTexture.value = on ? 1.0 : 0.0;
    },
    setFog(color, near, far) {
      uFogColor.value.copy(color);
      uFogNear.value = near;
      uFogFar.value = far;
    },
    setWireframe(on) {
      opaque.wireframe = on;
      water.wireframe = on;
    },
    dispose() {
      opaque.dispose();
      water.dispose();
    },
  };
}
