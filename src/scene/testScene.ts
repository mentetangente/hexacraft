import * as THREE from 'three';

// Fase 0: cubo (12 triángulos) y prisma hexagonal (20 triángulos) del mismo volumen (1).
// Los vértices se escriben a mano; en la fase 1 el prisma pasa a construirse con Grid.

type Vec3 = readonly [number, number, number];
type RGB = readonly [number, number, number];

interface Triangle {
  readonly v0: Vec3;
  readonly v1: Vec3;
  readonly v2: Vec3;
  readonly color: RGB;
}

interface Prism {
  readonly mesh: THREE.Mesh;
  readonly triangles: number;
}

function trisToMesh(triangles: readonly Triangle[]): THREE.Mesh {
  const positions = new Float32Array(triangles.length * 9);
  const colors = new Float32Array(triangles.length * 9);
  for (let i = 0; i < triangles.length; i++) {
    const t = triangles[i];
    const verts: readonly Vec3[] = [t.v0, t.v1, t.v2];
    for (let v = 0; v < 3; v++) {
      const p = verts[v];
      const idx = (i * 3 + v) * 3;
      positions[idx + 0] = p[0];
      positions[idx + 1] = p[1];
      positions[idx + 2] = p[2];
      colors[idx + 0] = t.color[0];
      colors[idx + 1] = t.color[1];
      colors[idx + 2] = t.color[2];
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return new THREE.Mesh(geom, mat);
}

function quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: RGB): [Triangle, Triangle] {
  return [
    { v0: a, v1: b, v2: c, color },
    { v0: a, v1: c, v2: d, color },
  ];
}

function buildCube(): Prism {
  const s = 0.5; // arista 1, volumen 1
  const top: RGB = [0.85, 0.85, 0.85];
  const bot: RGB = [0.3, 0.3, 0.3];
  const side: RGB = [0.55, 0.55, 0.55];

  const tris: Triangle[] = [
    // Bottom (-Y)
    ...quad([-s, -s, -s], [+s, -s, -s], [+s, -s, +s], [-s, -s, +s], bot),
    // Top (+Y)
    ...quad([-s, +s, +s], [+s, +s, +s], [+s, +s, -s], [-s, +s, -s], top),
    // Front (+Z)
    ...quad([-s, -s, +s], [+s, -s, +s], [+s, +s, +s], [-s, +s, +s], side),
    // Back (-Z)
    ...quad([+s, -s, -s], [-s, -s, -s], [-s, +s, -s], [+s, +s, -s], side),
    // Right (+X)
    ...quad([+s, -s, +s], [+s, -s, -s], [+s, +s, -s], [+s, +s, +s], side),
    // Left (-X)
    ...quad([-s, -s, -s], [-s, -s, +s], [-s, +s, +s], [-s, +s, -s], side),
  ];

  return { mesh: trisToMesh(tris), triangles: tris.length };
}

function buildHexPrism(): Prism {
  // Área del hexágono = 1 → R = sqrt(2 / (3 * sqrt(3))).
  const R = Math.sqrt(2 / (3 * Math.sqrt(3)));
  const h = 0.5; // altura total 1

  // 6 vértices en el plano XZ. Ángulo (30° - 60°·i) para que el orden 0..5
  // sea antihorario visto desde +Y (vértice arriba, pointy-top).
  const corners: Vec3[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((30 - 60 * i) * Math.PI) / 180;
    corners.push([R * Math.cos(angle), 0, R * Math.sin(angle)]);
  }

  const top: RGB = [0.85, 0.85, 0.85];
  const bot: RGB = [0.3, 0.3, 0.3];
  const side: RGB = [0.55, 0.55, 0.55];

  const tris: Triangle[] = [];

  const topOf = (v: Vec3): Vec3 => [v[0], +h, v[2]];
  const botOf = (v: Vec3): Vec3 => [v[0], -h, v[2]];

  // Tapa superior: abanico de 4 triángulos desde el vértice 0, orden CCW visto desde +Y.
  for (let i = 1; i < 5; i++) {
    tris.push({
      v0: topOf(corners[0]),
      v1: topOf(corners[i]),
      v2: topOf(corners[i + 1]),
      color: top,
    });
  }

  // Tapa inferior: mismo abanico pero orden invertido para que la normal apunte a -Y.
  for (let i = 1; i < 5; i++) {
    tris.push({
      v0: botOf(corners[0]),
      v1: botOf(corners[i + 1]),
      v2: botOf(corners[i]),
      color: bot,
    });
  }

  // 6 laterales, 2 triángulos cada uno (quad v_i, u_i, u_{i+1}, v_{i+1}).
  for (let i = 0; i < 6; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 6];
    tris.push(...quad(topOf(a), botOf(a), botOf(b), topOf(b), side));
  }

  return { mesh: trisToMesh(tris), triangles: tris.length };
}

export interface TestScene {
  readonly cube: THREE.Mesh;
  readonly hexPrism: THREE.Mesh;
  readonly cubeTriangles: number;
  readonly hexTriangles: number;
}

export function buildTestScene(): TestScene {
  const c = buildCube();
  const h = buildHexPrism();
  return {
    cube: c.mesh,
    hexPrism: h.mesh,
    cubeTriangles: c.triangles,
    hexTriangles: h.triangles,
  };
}
