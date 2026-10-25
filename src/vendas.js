const conexao = require('./db');
const { ErroApp, validarId } = require('./erros');
const { calcularComissao } = require('./comissao');

const SELECT_VENDAS = `
  SELECT v.id_venda, v.id_vendedor, ve.nome AS nome_vendedor,
         v.id_regiao, r.nome_regiao, v.data_venda, v.valor_venda,
         v.tipo_cliente, v.valor_comissao
    FROM vendas v
    JOIN vendedores ve ON ve.id_vendedor = v.id_vendedor
    JOIN regioes r     ON r.id_regiao = v.id_regiao`;

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

/** Aceita 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm[:ss]' ou com 'T'. Retorna 'YYYY-MM-DD HH:mm:ss'. */
function normalizarDataVenda(data) {
  if (data === undefined || data === null || data === '') return null; // usa NOW()
  if (typeof data !== 'string' || !REGEX_DATA.test(data.trim())) {
    throw new ErroApp(400, "data_venda deve estar no formato 'YYYY-MM-DD' ou 'YYYY-MM-DD HH:mm:ss'.");
  }
  let [dia, hora = '00:00:00'] = data.trim().replace('T', ' ').split(' ');
  if (hora.length === 5) hora += ':00';
  const d = new Date(`${dia}T${hora}Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dia) {
    throw new ErroApp(400, 'data_venda inválida.');
  }
  return `${dia} ${hora}`;
}

/**
 * Valida, calcula a comissão e registra a venda.
 * Validações: vendedor existente e ativo, região existente, valor positivo,
 * tipo de cliente válido e código de venda (id_venda) único.
 */
async function registrarVenda(dados = {}) {
  try {
    const { id_venda, id_vendedor, id_regiao, data_venda, valor_venda, tipo_cliente } = dados;

    const idVendedor = validarId(id_vendedor, 'id_vendedor');
    const idRegiao = validarId(id_regiao, 'id_regiao');
    const idVenda = id_venda === undefined || id_venda === null || id_venda === ''
      ? null
      : validarId(id_venda, 'id_venda');

    const valor = Number(valor_venda);
    if (valor_venda === null || valor_venda === '' || typeof valor_venda === 'boolean'
        || !Number.isFinite(valor) || valor <= 0) {
      throw new ErroApp(400, 'valor_venda deve ser um número positivo.');
    }
    if (valor > 9999999999.99) throw new ErroApp(400, 'valor_venda acima do limite permitido.');
    const valorOk = Math.round(valor * 100) / 100;
    if (valorOk <= 0) throw new ErroApp(400, 'valor_venda deve ser de pelo menos R$ 0,01.');

    if (tipo_cliente !== 'PF' && tipo_cliente !== 'PJ') {
      throw new ErroApp(400, "tipo_cliente deve ser 'PF' ou 'PJ'.");
    }
    const dataOk = normalizarDataVenda(data_venda);

    // vendedor existente e ativo
    const [vendedores] = await conexao.execute(
      'SELECT percentual_base, ativo FROM vendedores WHERE id_vendedor = ?',
      [idVendedor]
    );
    if (vendedores.length === 0) throw new ErroApp(404, `Vendedor ${idVendedor} não encontrado.`);
    if (!vendedores[0].ativo) throw new ErroApp(422, `Vendedor ${idVendedor} está inativo e não pode registrar vendas.`);

    // região existente
    const [regioes] = await conexao.execute(
      'SELECT percentual_bonus FROM regioes WHERE id_regiao = ?',
      [idRegiao]
    );
    if (regioes.length === 0) throw new ErroApp(404, `Região ${idRegiao} não encontrada.`);

    // código de venda único
    if (idVenda !== null) {
      const [existente] = await conexao.execute('SELECT 1 FROM vendas WHERE id_venda = ?', [idVenda]);
      if (existente.length > 0) throw new ErroApp(409, `Já existe uma venda com o código ${idVenda}.`);
    }

    const { valorComissao, percentualTotal } = await calcularComissao(
      valorOk, vendedores[0].percentual_base, tipo_cliente, regioes[0].percentual_bonus
    );

    let resultado;
    try {
      [resultado] = await conexao.execute(
        `INSERT INTO vendas (id_venda, id_vendedor, id_regiao, data_venda, valor_venda, tipo_cliente, valor_comissao)
         VALUES (?, ?, ?, COALESCE(?, NOW()), ?, ?, ?)`,
        [idVenda, idVendedor, idRegiao, dataOk, valorOk, tipo_cliente, valorComissao]
      );
    } catch (erro) {
      // corrida entre dois cadastros com o mesmo código
      if (erro.code === 'ER_DUP_ENTRY') throw new ErroApp(409, `Já existe uma venda com o código ${idVenda}.`);
      throw erro;
    }

    const [venda] = await conexao.execute(`${SELECT_VENDAS} WHERE v.id_venda = ?`, [idVenda ?? resultado.insertId]);
    return { ...venda[0], percentual_aplicado: percentualTotal };
  } catch (erro) {
    console.error('Erro ao registrar venda:', erro.message);
    throw erro;
  }
}

/** Lista todas as vendas (mais recentes primeiro), com nome do vendedor e da região. */
async function listarVendas() {
  try {
    const [resultados] = await conexao.execute(`${SELECT_VENDAS} ORDER BY v.data_venda DESC, v.id_venda DESC`);
    return resultados;
  } catch (erro) {
    console.error('Erro ao consultar vendas:', erro.message);
    throw erro;
  }
}

/** Vendas de um vendedor; 404 se o vendedor não existir. */
async function consultarVendasPorVendedor(idVendedor) {
  try {
    const id = validarId(idVendedor, 'id_vendedor');
    const [vendedor] = await conexao.execute('SELECT 1 FROM vendedores WHERE id_vendedor = ?', [id]);
    if (vendedor.length === 0) throw new ErroApp(404, `Vendedor ${id} não encontrado.`);

    const [resultados] = await conexao.execute(
      `${SELECT_VENDAS} WHERE v.id_vendedor = ? ORDER BY v.data_venda DESC, v.id_venda DESC`,
      [id]
    );
    return resultados;
  } catch (erro) {
    console.error('Erro ao consultar vendas por vendedor:', erro.message);
    throw erro;
  }
}

/** Vendas de uma região; 404 se a região não existir. */
async function consultarVendasPorRegiao(idRegiao) {
  try {
    const id = validarId(idRegiao, 'id_regiao');
    const [regiao] = await conexao.execute('SELECT 1 FROM regioes WHERE id_regiao = ?', [id]);
    if (regiao.length === 0) throw new ErroApp(404, `Região ${id} não encontrada.`);

    const [resultados] = await conexao.execute(
      `${SELECT_VENDAS} WHERE v.id_regiao = ? ORDER BY v.data_venda DESC, v.id_venda DESC`,
      [id]
    );
    return resultados;
  } catch (erro) {
    console.error('Erro ao consultar vendas por região:', erro.message);
    throw erro;
  }
}

/** Exclui uma venda após verificar se ela existe. */
async function excluirVenda(idVenda) {
  try {
    const id = validarId(idVenda, 'id_venda');
    const [existente] = await conexao.execute('SELECT id_venda FROM vendas WHERE id_venda = ?', [id]);
    if (existente.length === 0) throw new ErroApp(404, `Venda ${id} não encontrada.`);

    await conexao.execute('DELETE FROM vendas WHERE id_venda = ?', [id]);
    return { id_venda: id, mensagem: 'Venda excluída com sucesso.' };
  } catch (erro) {
    console.error('Erro ao excluir venda:', erro.message);
    throw erro;
  }
}

module.exports = {
  registrarVenda,
  listarVendas,
  consultarVendasPorVendedor,
  consultarVendasPorRegiao,
  excluirVenda,
};
