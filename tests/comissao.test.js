// Testes unitários da regra de comissão (não precisam de banco). Execução: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularComissao } = require('../src/comissao');

test('exemplo do enunciado: R$ 2.000, PJ, Norte, base 5% => 9% => R$ 180,00', async () => {
  const r = await calcularComissao(2000, 5, 'PJ', 1);
  assert.equal(r.percentualTotal, 9);
  assert.equal(r.valorComissao, 180);
});

test('PF no Sudeste (sem bônus regional): base 4% + 2% = 6%', async () => {
  const r = await calcularComissao(5000, 4, 'PF', 0);
  assert.equal(r.percentualTotal, 6);
  assert.equal(r.valorComissao, 300);
});

test('PJ no Sul (0,5%): base 3,5% + 3% + 0,5% = 7%', async () => {
  const r = await calcularComissao(2900, 3.5, 'PJ', 0.5);
  assert.equal(r.percentualTotal, 7);
  assert.equal(r.valorComissao, 203);
});

test('percentuais são somados, sem composição', async () => {
  const r = await calcularComissao(1000, 10, 'PJ', 1);
  assert.equal(r.valorComissao, 140); // 14%, e não 10% * 1,03 * 1,01
});

test('arredonda para centavos', async () => {
  const r = await calcularComissao(3333.33, 5.5, 'PF', 0.5); // 8%
  assert.equal(r.valorComissao, 266.67);
});

test('rejeita valor não positivo', async () => {
  await assert.rejects(() => calcularComissao(0, 5, 'PF', 1), { status: 400 });
  await assert.rejects(() => calcularComissao(-10, 5, 'PF', 1), { status: 400 });
  await assert.rejects(() => calcularComissao('abc', 5, 'PF', 1), { status: 400 });
});

test('rejeita tipo de cliente inválido', async () => {
  await assert.rejects(() => calcularComissao(100, 5, 'XX', 1), { status: 400 });
  await assert.rejects(() => calcularComissao(100, 5, undefined, 1), { status: 400 });
});
