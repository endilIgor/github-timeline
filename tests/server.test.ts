// Teste da Tarefa 8: inicialização local do servidor Hono em porta efêmera (0),
// encerramento garantido em finally, sem chamada real ao GitHub para username inválido (%40).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, resolvePort } from '../src/server.js';

// RED/GREEN principal: servidor real sobe em porta efêmera, responde 400 INVALID_USERNAME
// para %40 sem consultar o GitHub, e é encerrado no finally.
test('sobe em porta efêmera, responde 400 INVALID_USERNAME para %40 sem chamar o GitHub, e encerra no finally', async () => {
  let githubCalled = false;
  const fetchImpl: typeof fetch = async () => {
    githubCalled = true;
    throw new Error('não deveria consultar o GitHub para um username inválido');
  };

  const running = await startServer({ port: 0, fetchImpl, corsOrigins: [] });
  try {
    assert.ok(running.port > 0);

    const response = await fetch(`http://127.0.0.1:${running.port}/api/timeline/%40`);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('content-type')?.includes('application/json'), true);

    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'INVALID_USERNAME');
    assert.equal(githubCalled, false);
  } finally {
    await running.close();
  }
});

// Opcional: resolução de PORT configurável/padrão 3000.
test('resolvePort usa o valor de PORT informado quando é um inteiro válido', () => {
  assert.equal(resolvePort('4321'), 4321);
  assert.equal(resolvePort('0'), 0);
});

test('resolvePort usa 3000 como padrão quando PORT está ausente ou inválido', () => {
  assert.equal(resolvePort(undefined), 3000);
  assert.equal(resolvePort(''), 3000);
  assert.equal(resolvePort('abc'), 3000);
  assert.equal(resolvePort('-1'), 3000);
});
