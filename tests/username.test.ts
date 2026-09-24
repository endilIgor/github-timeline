// Teste da Tarefa 2: validação local do login GitHub (CA-7), antes de qualquer chamada de rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidUsername } from '../src/username.js';

test('rejeita login com espaço', () => {
  assert.equal(isValidUsername('octo cat'), false);
});

test('rejeita login com @', () => {
  assert.equal(isValidUsername('octo@cat'), false);
});

test('rejeita login com mais de 39 caracteres', () => {
  const tooLong = 'a'.repeat(40);
  assert.equal(isValidUsername(tooLong), false);
});

test('aceita login com exatamente 39 caracteres', () => {
  const maxLength = 'a'.repeat(39);
  assert.equal(isValidUsername(maxLength), true);
});

test('rejeita login com hífen no início', () => {
  assert.equal(isValidUsername('-octocat'), false);
});

test('rejeita login com hífen no final', () => {
  assert.equal(isValidUsername('octocat-'), false);
});

test('aceita login válido com hífen no meio e números', () => {
  assert.equal(isValidUsername('octo-cat-42'), true);
});

test('aceita login válido simples com letras e números', () => {
  assert.equal(isValidUsername('octocat123'), true);
});

test('rejeita string vazia', () => {
  assert.equal(isValidUsername(''), false);
});
