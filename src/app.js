const express = require('express');
const conexao = require('./db');
const { ErroApp } = require('./erros');
const vendedores = require('./vendedores');
const vendas = require('./vendas');
const { gerarRelatorioPerformance } = require('./relatorios');

const app = express();
app.use(express.json());

// Envolve handlers async para que qualquer erro caia no middleware de erros.
const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------------------------------------------------------- Saúde
app.get('/saude', rota(async (req, res) => {
  await conexao.query('SELECT 1');
  res.status(200).json({ status: 'ok', banco: 'conectado' });
}));

// ------------------------------------------------------------ Vendedores
app.post('/vendedores', rota(async (req, res) => {
  const vendedor = await vendedores.cadastrarVendedor(req.body);
  res.status(201).json(vendedor);
}));

app.get('/vendedores', rota(async (req, res) => {
  res.status(200).json(await vendedores.listarVendedores({ ativo: req.query.ativo }));
}));

app.get('/vendedores/:id', rota(async (req, res) => {
  res.status(200).json(await vendedores.consultarVendedor(req.params.id));
}));

app.put('/vendedores/:id', rota(async (req, res) => {
  res.status(200).json(await vendedores.atualizarVendedor(req.params.id, req.body));
}));

app.patch('/vendedores/:id/desativar', rota(async (req, res) => {
  res.status(200).json(await vendedores.desativarVendedor(req.params.id));
}));

// ---------------------------------------------------------------- Vendas
app.post('/vendas', rota(async (req, res) => {
  res.status(201).json(await vendas.registrarVenda(req.body));
}));

app.get('/vendas', rota(async (req, res) => {
  res.status(200).json(await vendas.listarVendas());
}));

app.get('/vendas/vendedor/:id', rota(async (req, res) => {
  res.status(200).json(await vendas.consultarVendasPorVendedor(req.params.id));
}));

app.get('/vendas/regiao/:id', rota(async (req, res) => {
  res.status(200).json(await vendas.consultarVendasPorRegiao(req.params.id));
}));

app.delete('/vendas/:id', rota(async (req, res) => {
  res.status(200).json(await vendas.excluirVenda(req.params.id));
}));

// ------------------------------------------------------------ Relatórios
app.get('/relatorios/performance', rota(async (req, res) => {
  const { inicio, fim, mes } = req.query;
  res.status(200).json(await gerarRelatorioPerformance(inicio, fim, mes));
}));

// ------------------------------------------------- 404 e tratamento de erros
app.use((req, res) => {
  res.status(404).json({ erro: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
});

// eslint-disable-next-line no-unused-vars
app.use((erro, req, res, next) => {
  if (erro instanceof ErroApp) {
    return res.status(erro.status).json({ erro: erro.message });
  }
  if (erro.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido no corpo da requisição.' });
  }
  // Falha de conexão / banco indisponível / credenciais
  const falhaConexao = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST',
    'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ECONNRESET'].includes(erro.code);
  if (falhaConexao) {
    console.error('Falha de conexão com o banco:', erro.code, erro.message);
    return res.status(503).json({ erro: 'Banco de dados indisponível. Tente novamente mais tarde.' });
  }
  if (erro.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ erro: 'Registro duplicado.' });
  }
  console.error('Erro não tratado:', erro);
  return res.status(500).json({ erro: 'Erro interno do servidor.' });
});

module.exports = app;
