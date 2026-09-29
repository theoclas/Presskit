import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// El bundle público (index, página del DJ, legales) no debe traer las librerías del admin:
// antd, axios, dayjs, dnd-kit ni lib/http. Solo pueden llegar por import() diferidos.
// 1) Recorre los imports ESTÁTICOS desde src/main.tsx (sin build).
// 2) Si hay un build en dist/, revisa los archivos que carga index.html.

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(WEB, 'src');

const FORBIDDEN_PACKAGES = /^(antd|@ant-design\/|axios|dayjs|@dnd-kit\/|@rc-component\/|rc-[a-z-]+)(\/|$)/;
const FORBIDDEN_LOCAL = [/^lib[\\/]http\.ts$/, /^(admin|auth|editor-kit|theme)[\\/]/];

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

/** Imports y re-exports estáticos que sobreviven a la compilación (sin `import type`). */
function staticImports(code: string): string[] {
  const out: string[] = [];
  const re = /(?:^|[;\n}])\s*(import|export)\s+(type\s+)?(?:([^'"()]*?)\s+from\s+)?['"]([^'"\n]+)['"]/g;
  for (const m of stripComments(code).matchAll(re)) {
    if (m[2]) continue; // import type / export type: se borra al compilar
    const clause = m[3] ?? '';
    // import { type A, type B } from 'x': solo tipos, también se borra.
    if (/^\{[\s\S]*\}$/.test(clause.trim())) {
      const names = clause.trim().slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
      if (names.length && names.every((n) => n.startsWith('type '))) continue;
    }
    if (m[1] === 'export' && !m[3]) continue;
    out.push(m[4]!);
  }
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts'), resolve(base, 'index.tsx')];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function walkEntry(entry: string): { files: Set<string>; problems: string[] } {
  const files = new Set<string>();
  const problems: string[] = [];
  const parent = new Map<string, string>();
  const chain = (file: string) => {
    const parts = [relative(SRC, file)];
    let cur = parent.get(file);
    while (cur) {
      parts.unshift(relative(SRC, cur));
      cur = parent.get(cur);
    }
    return parts.join(' -> ');
  };
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    if (files.has(file)) continue;
    files.add(file);
    const rel = relative(SRC, file);
    if (FORBIDDEN_LOCAL.some((re) => re.test(rel))) problems.push(`${chain(file)} (módulo del admin)`);
    if (!/\.(ts|tsx)$/.test(file)) continue;
    for (const spec of staticImports(readFileSync(file, 'utf8'))) {
      if (FORBIDDEN_PACKAGES.test(spec)) {
        problems.push(`${chain(file)} importa "${spec}"`);
        continue;
      }
      if (!spec.startsWith('.')) continue;
      const target = resolveLocal(file, spec);
      if (target && !files.has(target)) {
        if (!parent.has(target)) parent.set(target, file);
        queue.push(target);
      }
    }
  }
  return { files, problems };
}

describe('bundle público sin librerías del admin', () => {
  it('el parser de imports ignora import() diferidos e import type', () => {
    const code = `
      import type { X } from 'antd';
      import { type A, type B } from 'axios';
      import { useState } from 'react';
      import './a.css';
      export { thing } from './thing';
      const lazy = () => import('./admin/AdminApp');
    `;
    expect(staticImports(code)).toEqual(['react', './a.css', './thing']);
  });

  it('src/main.tsx no llega a antd/axios/dayjs/dnd-kit ni a lib/http por imports estáticos', () => {
    const { files, problems } = walkEntry(resolve(SRC, 'main.tsx'));
    expect(files.size).toBeGreaterThan(20);
    // routes.tsx debe estar en el grafo (si no, la prueba no estaría mirando nada).
    expect([...files].some((f) => f.endsWith('routes.tsx'))).toBe(true);
    expect(problems).toEqual([]);
  });

  const indexHtml = resolve(WEB, 'dist/index.html');
  it.skipIf(!existsSync(indexHtml))('dist: los archivos de la carga inicial no contienen antd, axios ni dayjs', () => {
    const html = readFileSync(indexHtml, 'utf8');
    const initial = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]!);
    expect(initial.length).toBeGreaterThan(0);
    // Firmas que el minificador no borra (cadenas literales de cada librería).
    const signatures: [string, RegExp][] = [
      ['axios', /AxiosError|ERR_BAD_REQUEST/],
      ['dayjs', /\$isDayjsObject/],
      ['antd', /anticon|data-css-hash/],
    ];
    const bad: string[] = [];
    for (const rel of new Set(initial)) {
      const code = readFileSync(resolve(WEB, 'dist', rel), 'utf8');
      for (const [name, re] of signatures) if (re.test(code)) bad.push(`${rel} (${name})`);
    }
    expect(bad).toEqual([]);
  });
});
