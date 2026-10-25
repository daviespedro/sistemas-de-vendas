// Teste de integração da API (requer MySQL com sql/db_vendas.sql carregado e .env configurado).
// Execução: npm run test:api
// Cobre os cenários da seção 9 do enunciado. Os dados criados pelo teste são removidos no final.
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const conexao = require('../src/db');

let servidor;
let base;
let idVendedor;
const ID_VENDA_TESTE = 990001;

async function chamar(metodo, caminho, corpo) {
  const resp = await fetch(base + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: resp.status, corpo: await resp.json() };
}

test.before(async () => {
  await new Promise((ok) => { servidor = app.listen(0, ok); });
  base = `http://127.0.0.1:${servidor.address().port}`;
  await conexao.execute('DELETE FROM vendas WHERE id_venda = ?', [ID_VENDA_TESTE]);
});

test.after(async () => {
  if (idVendedor) {
    await conexao.execute('DELETE FROM vendas WHERE id_vendedor = ?', [idVendedor]);
    await conexao.execute('DELETE FROM vendedores WHERE id_vendedor = ?', [idVendedor]);
  }
  await new Promise((ok) => servidor.close(ok));
  await conexao.end();
});

test('conexão com o banco (GET /saude)', async () => {
  const r = await chamar('GET', '/saude');
  assert.equal(r.status, 200);
});

test('cadastra vendedor (201)', async () => {
  const r = await chamar('POST', '/vendedores', { nome: 'Teste Automatizado', meta_mensal: 10000, percentual_base: 5 });
  assert.equal(r.status, 201);
  assert.equal(r.corpo.ativo, 1);
  idVendedor = r.corpo.id_vendedor;
});

test('rejeita cadastro inválido (400)', async () => {
  const r = await chamar('POST', '/vendedores', { nome: '', meta_mensal: -1, percentual_base: 5 });
  assert.equal(r.status, 400);
});

test('registra venda com comissão correta: R$ 2.000, PJ, Norte, base 5% => R$ 180,00', async () => {
  const r = await chamar('POST', '/vendas', {
    id_venda: ID_VENDA_TESTE, id_vendedor: idVendedor, id_regiao: 1,
    data_venda: '2026-10-10 10:00:00', valor_venda: 2000, tipo_cliente: 'PJ',
  });
  assert.equal(r.status, 201);
  assert.equal(r.corpo.valor_comissao, 180);
  assert.equal(r.corpo.percentual_aplicado, 9);
});

test('rejeita código de venda duplicado (409)', async () => {
  const r = await chamar('POST', '/vendas', {
    id_venda: ID_VENDA_TESTE, id_vendedor: idVendedor, id_regiao: 1, valor_venda: 100, tipo_cliente: 'PF',
  });
  assert.equal(r.status, 409);
});

test('rejeita vendedor inexistente (404), região inexistente (404) e valor inválido (400)', async () => {
  const semVendedor = await chamar('POST', '/vendas', { id_vendedor: 999999, id_regiao: 1, valor_venda: 100, tipo_cliente: 'PF' });
  assert.equal(semVendedor.status, 404);
  const semRegiao = await chamar('POST', '/vendas', { id_vendedor: idVendedor, id_regiao: 999, valor_venda: 100, tipo_cliente: 'PF' });
  assert.equal(semRegiao.status, 404);
  const valorRuim = await chamar('POST', '/vendas', { id_vendedor: idVendedor, id_regiao: 1, valor_venda: -5, tipo_cliente: 'PF' });
  assert.equal(valorRuim.status, 400);
});

test('atualiza a meta mensal', async () => {
  const r = await chamar('PUT', `/vendedores/${idVendedor}`, { meta_mensal: 1500 });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.meta_mensal, 1500);
  assert.equal(r.corpo.percentual_base, 5);
});

test('consulta vendas por vendedor e por região', async () => {
  const porVendedor = await chamar('GET', `/vendas/vendedor/${idVendedor}`);
  assert.equal(porVendedor.status, 200);
  assert.equal(porVendedor.corpo.length, 1);
  const porRegiao = await chamar('GET', '/vendas/regiao/1');
  assert.equal(porRegiao.status, 200);
  assert.ok(porRegiao.corpo.some((v) => v.id_venda === ID_VENDA_TESTE));
  assert.ok(porRegiao.corpo.every((v) => v.id_regiao === 1));
});

test('relatório mensal identifica atingimento de meta', async () => {
  const r = await chamar('GET', '/relatorios/performance?inicio=2026-10-01&fim=2026-10-31');
  assert.equal(r.status, 200);
  const meu = r.corpo.metas.detalhe.find((m) => m.id_vendedor === idVendedor);
  assert.equal(meu.total_vendido_mes, 2000);
  assert.equal(meu.meta_atingida, true); // meta atualizada para 1.500
  assert.ok(r.corpo.total_vendas >= 1);
  assert.equal(r.corpo.vendas_por_regiao.length, 4);
});

test('relatório rejeita datas inválidas (400)', async () => {
  assert.equal((await chamar('GET', '/relatorios/performance')).status, 400);
  assert.equal((await chamar('GET', '/relatorios/performance?inicio=2026-10-31&fim=2026-10-01')).status, 400);
});

test('desativa vendedor, impede nova venda (422) e preserva o histórico', async () => {
  const d = await chamar('PATCH', `/vendedores/${idVendedor}/desativar`);
  assert.equal(d.status, 200);
  assert.equal(d.corpo.ativo, 0);
  const venda = await chamar('POST', '/vendas', { id_vendedor: idVendedor, id_regiao: 1, valor_venda: 100, tipo_cliente: 'PF' });
  assert.equal(venda.status, 422);
  const historico = await chamar('GET', `/vendas/vendedor/${idVendedor}`);
  assert.equal(historico.corpo.length, 1);
});

test('exclui venda existente (200) e retorna 404 na segunda exclusão', async () => {
  assert.equal((await chamar('DELETE', `/vendas/${ID_VENDA_TESTE}`)).status, 200);
  assert.equal((await chamar('DELETE', `/vendas/${ID_VENDA_TESTE}`)).status, 404);
});

test('vendedor inexistente retorna 404', async () => {
  assert.equal((await chamar('GET', '/vendedores/999999')).status, 404);
});

test('SQL Injection em parâmetro é tratado como valor (400)', async () => {
  const r = await chamar('GET', `/vendedores/${encodeURIComponent('1 OR 1=1')}`);
  assert.equal(r.status, 400);
});
