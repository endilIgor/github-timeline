// Teste de fundação (Tarefa 1): valida scripts/dependências do package.json,
// os tsconfig e as exclusões do .gitignore antes de existir qualquer código de produção.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(relativePath) {
  const raw = await readFile(path.join(rootDir, relativePath), 'utf8');
  return JSON.parse(raw);
}

test('package.json declara os scripts do plano aprovado', async () => {
  const pkg = await readJson('package.json');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.engines?.node, '>=22');
  assert.equal(pkg.scripts?.test, 'tsx --test tests/*.test.*');
  assert.equal(pkg.scripts?.typecheck, 'tsc --noEmit');
  assert.equal(pkg.scripts?.build, 'tsc -p tsconfig.build.json');
  assert.equal(pkg.scripts?.dev, 'tsx watch src/server.ts');
  assert.equal(pkg.scripts?.start, 'node dist/src/server.js');
});

test('package.json fixa as versões de dependências aprovadas no plan.md', async () => {
  const pkg = await readJson('package.json');
  assert.equal(pkg.dependencies?.hono, '4.13.9');
  assert.equal(pkg.dependencies?.['@hono/node-server'], '2.1.1');
  assert.equal(pkg.devDependencies?.typescript, '5.9.3');
  assert.equal(pkg.devDependencies?.tsx, '4.23.15');
  assert.equal(pkg.devDependencies?.['@types/node'], '22.20.4');
});

test('package-lock.json existe e referencia as mesmas versões', async () => {
  const lock = await readJson('package-lock.json');
  assert.equal(lock.packages?.['node_modules/hono']?.version, '4.13.9');
  assert.equal(lock.packages?.['node_modules/@hono/node-server']?.version, '2.1.1');
  assert.equal(lock.packages?.['node_modules/typescript']?.version, '5.9.3');
});

test('tsconfig.json usa resolução ESM para Node 22', async () => {
  const tsconfig = await readJson('tsconfig.json');
  assert.equal(tsconfig.compilerOptions?.module, 'NodeNext');
  assert.equal(tsconfig.compilerOptions?.moduleResolution, 'NodeNext');
  assert.equal(tsconfig.compilerOptions?.strict, true);
});

test('tsconfig.build.json define rootDir, outDir e include conforme plan.md', async () => {
  const tsconfigBuild = await readJson('tsconfig.build.json');
  assert.equal(tsconfigBuild.compilerOptions?.rootDir, '.');
  assert.equal(tsconfigBuild.compilerOptions?.outDir, 'dist');
  assert.deepEqual(tsconfigBuild.include, ['src/**/*.ts']);
});

test('.gitignore exclui artefatos locais (node_modules, dist, .env)', async () => {
  const gitignore = await readFile(path.join(rootDir, '.gitignore'), 'utf8');
  const lines = gitignore.split('\n').map((line) => line.trim());
  assert.ok(lines.includes('node_modules'), 'deve ignorar node_modules');
  assert.ok(lines.includes('dist'), 'deve ignorar dist');
  assert.ok(lines.includes('.env'), 'deve ignorar .env');
});
