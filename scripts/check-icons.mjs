// Verifies every lucide-react icon imported in src/ exists in the installed version.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const dts = readFileSync('node_modules/lucide-react/dist/lucide-react.d.ts', 'utf8');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
let bad = 0;
for (const f of walk('src').filter((f) => /\.tsx?$/.test(f))) {
  const m = readFileSync(f, 'utf8').match(/import\s*{([^}]+)}\s*from\s*'lucide-react'/);
  if (!m) continue;
  for (const name of m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
    if (name.startsWith('type ')) continue;
    if (!dts.includes(`declare const ${name}:`) && !dts.includes(` as ${name},`) && !dts.includes(` as ${name} }`)) { console.log(`${f}: missing ${name}`); bad++; }
  }
}
console.log(bad ? `${bad} missing` : 'all icons ok');
