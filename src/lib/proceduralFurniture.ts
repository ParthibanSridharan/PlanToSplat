import * as THREE from 'three';

/** Low-poly procedural furniture (metres, origin at floor centre). */

function mat(color: number, roughness = 0.8, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  return mesh;
}

function legs(g: THREE.Group, w: number, d: number, h: number, m: THREE.Material, t = 0.05) {
  const ox = w / 2 - t, oz = d / 2 - t;
  for (const [x, z] of [[-ox, -oz], [ox, -oz], [-ox, oz], [ox, oz]]) g.add(box(t, h, t, m, x, 0, z));
}

export function buildProceduralFurniture(key: string): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x8b5a2b);
  const darkWood = mat(0x4a2f1b);
  const fabric = mat(0x5b6c8f, 0.95);
  const fabricWarm = mat(0xb07a5a, 0.95);
  const metal = mat(0x2b2f36, 0.4, 0.6);
  const white = mat(0xe8e4dc);
  switch (key) {
    case 'sofa':
      g.add(box(2.1, 0.42, 0.9, fabric, 0, 0.08));
      g.add(box(2.1, 0.45, 0.2, fabric, 0, 0.45, -0.35));
      g.add(box(0.2, 0.25, 0.9, fabric, -0.95, 0.45));
      g.add(box(0.2, 0.25, 0.9, fabric, 0.95, 0.45));
      legs(g, 2.0, 0.8, 0.08, metal, 0.04);
      break;
    case 'armchair':
      g.add(box(0.85, 0.42, 0.85, fabricWarm, 0, 0.1));
      g.add(box(0.85, 0.5, 0.18, fabricWarm, 0, 0.5, -0.33));
      g.add(box(0.15, 0.22, 0.85, fabricWarm, -0.35, 0.5));
      g.add(box(0.15, 0.22, 0.85, fabricWarm, 0.35, 0.5));
      legs(g, 0.8, 0.8, 0.1, darkWood, 0.04);
      break;
    case 'table':
      g.add(box(1.8, 0.05, 0.9, wood, 0, 0.7));
      legs(g, 1.7, 0.8, 0.7, darkWood, 0.07);
      break;
    case 'coffee':
      g.add(box(1.1, 0.05, 0.6, wood, 0, 0.38));
      g.add(box(1.0, 0.03, 0.5, darkWood, 0, 0.12));
      legs(g, 1.05, 0.55, 0.38, metal, 0.03);
      break;
    case 'chair':
      g.add(box(0.45, 0.05, 0.45, wood, 0, 0.45));
      g.add(box(0.45, 0.45, 0.04, wood, 0, 0.5, -0.2));
      legs(g, 0.42, 0.42, 0.45, darkWood, 0.035);
      break;
    case 'bed':
      g.add(box(1.6, 0.3, 2.1, darkWood, 0, 0.1));
      g.add(box(1.55, 0.22, 2.0, white, 0, 0.4));
      g.add(box(1.6, 0.8, 0.08, darkWood, 0, 0.1, -1.05));
      g.add(box(0.6, 0.12, 0.35, white, -0.4, 0.62, -0.75));
      g.add(box(0.6, 0.12, 0.35, white, 0.4, 0.62, -0.75));
      g.add(box(1.56, 0.06, 1.2, fabric, 0, 0.62, 0.35));
      break;
    case 'lamp': {
      g.add(cyl(0.16, 0.18, 0.03, metal));
      g.add(cyl(0.015, 0.015, 1.5, metal, 0, 0.03));
      const shade = cyl(0.12, 0.22, 0.3, new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffd28a, emissiveIntensity: 0.6, side: THREE.DoubleSide }), 0, 1.45);
      g.add(shade);
      const light = new THREE.PointLight(0xffd9a0, 2.5, 4, 2);
      light.position.set(0, 1.5, 0);
      g.add(light);
      break;
    }
    case 'plant': {
      g.add(cyl(0.18, 0.13, 0.35, mat(0xc4b8a6)));
      const leaf = mat(0x3f7d3a, 0.9);
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18 + Math.random() * 0.08, 0), leaf);
        const a = (i / 7) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.14, 0.55 + Math.random() * 0.35, Math.sin(a) * 0.14);
        s.castShadow = true;
        g.add(s);
      }
      break;
    }
    case 'shelf':
      g.add(box(0.03, 1.8, 0.35, wood, -0.5, 0));
      g.add(box(0.03, 1.8, 0.35, wood, 0.5, 0));
      for (let i = 0; i < 5; i++) g.add(box(1.0, 0.03, 0.35, wood, 0, i * 0.44));
      for (let i = 0; i < 4; i++) {
        for (let b = 0; b < 6; b++) {
          const hue = new THREE.Color().setHSL(Math.random(), 0.45, 0.45);
          g.add(box(0.05, 0.25 + Math.random() * 0.1, 0.25, mat(hue.getHex()), -0.4 + b * 0.09, i * 0.44 + 0.03));
        }
      }
      break;
    case 'rug':
      g.add(box(2.4, 0.012, 1.7, mat(0x9c4a3c, 1)));
      g.add(box(2.1, 0.014, 1.4, mat(0xd9c3a5, 1)));
      break;
    default:
      g.add(box(0.5, 0.5, 0.5, white));
  }
  return g;
}
