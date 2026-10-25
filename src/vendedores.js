const conexao = require('./db');
const { ErroApp, validarId } = require('./erros');

function validarNome(nome) {
  if (typeof nome !== 'string' || nome.trim() === '') {
    throw new ErroApp(400, 'nome é obrigatório.');
  }
  if (nome.trim().length > 100) {
    throw new ErroApp(400, 'nome deve ter no máximo 100 caracteres.');
  }
  return nome.trim();
}

function validarMeta(meta) {
  const n = Number(meta);
  if (meta === null || meta === '' || typeof meta === 'boolean' || !Number.isFinite(n) || n < 0) {
    throw new ErroApp(400, 'meta_mensal deve ser um número maior ou igual a zero.');
  }
  if (n > 9999999999.99) throw new ErroApp(400, 'meta_mensal acima do limite permitido.');
  return Math.round(n * 100) / 100;
}

function validarPercentualBase(pct) {
  const n = Number(pct);
  if (pct === null || pct === '' || typeof pct === 'boolean' || !Number.isFinite(n) || n < 0 || n > 100) {
    throw new ErroApp(400, 'percentual_base deve ser um número entre 0 e 100.');
  }
  return Math.round(n * 100) / 100;
}

/** Insere um vendedor no MySQL. */
async function cadastrarVendedor({ nome, meta_mensal, percentual_base } = {}) {
  try {
    const nomeOk = validarNome(nome);
    const metaOk = validarMeta(meta_mensal);
    const baseOk = validarPercentualBase(percentual_base);

    const [resultado] = await conexao.execute(
      'INSERT INTO vendedores (nome, meta_mensal, percentual_base, ativo) VALUES (?, ?, ?, 1)',
      [nomeOk, metaOk, baseOk]
    );
    return await consultarVendedor(resultado.insertId);
  } catch (erro) {
    console.error('Erro ao cadastrar vendedor:', erro.message);
    throw erro;
  }
}

/**
 * Consulta vendedores. Sem filtro, lista todos (ativos e inativos).
 * @param {{ativo?: 0|1|'0'|'1'|boolean}} [filtro]
 */
async function listarVendedores(filtro = {}) {
  try {
    let sql = 'SELECT id_vendedor, nome, meta_mensal, percentual_base, ativo FROM vendedores';
    const params = [];
    if (filtro.ativo !== undefined && filtro.ativo !== '') {
      const v = String(filtro.ativo).toLowerCase();
      if (!['0', '1', 'true', 'false'].includes(v)) {
        throw new ErroApp(400, 'ativo deve ser 0, 1, true ou false.');
      }
      sql += ' WHERE ativo = ?';
      params.push(v === '1' || v === 'true' ? 1 : 0);
    }
    sql += ' ORDER BY id_vendedor';
    const [resultados] = await conexao.execute(sql, params);
    return resultados;
  } catch (erro) {
    console.error('Erro ao consultar vendedores:', erro.message);
    throw erro;
  }
}

/** Consulta um vendedor pelo código; lança 404 se não existir. */
async function consultarVendedor(id) {
  try {
    const idOk = validarId(id, 'id_vendedor');
    const [linhas] = await conexao.execute(
      'SELECT id_vendedor, nome, meta_mensal, percentual_base, ativo FROM vendedores WHERE id_vendedor = ?',
      [idOk]
    );
    if (linhas.length === 0) throw new ErroApp(404, `Vendedor ${idOk} não encontrado.`);
    return linhas[0];
  } catch (erro) {
    console.error('Erro ao consultar vendedor:', erro.message);
    throw erro;
  }
}

/** Atualiza meta mensal e/ou percentual base (ao menos um dos dois). */
async function atualizarVendedor(id, { meta_mensal, percentual_base } = {}) {
  try {
    const idOk = validarId(id, 'id_vendedor');
    if (meta_mensal === undefined && percentual_base === undefined) {
      throw new ErroApp(400, 'Informe meta_mensal e/ou percentual_base para atualizar.');
    }
    await consultarVendedor(idOk); // garante 404 se não existir

    const campos = [];
    const params = [];
    if (meta_mensal !== undefined) {
      campos.push('meta_mensal = ?');
      params.push(validarMeta(meta_mensal));
    }
    if (percentual_base !== undefined) {
      campos.push('percentual_base = ?');
      params.push(validarPercentualBase(percentual_base));
    }
    params.push(idOk);

    await conexao.execute(`UPDATE vendedores SET ${campos.join(', ')} WHERE id_vendedor = ?`, params);
    return await consultarVendedor(idOk);
  } catch (erro) {
    console.error('Erro ao atualizar vendedor:', erro.message);
    throw erro;
  }
}

/** Desativa o vendedor (ativo = 0). O histórico de vendas é preservado. */
async function desativarVendedor(id) {
  try {
    const idOk = validarId(id, 'id_vendedor');
    await consultarVendedor(idOk); // 404 se não existir
    await conexao.execute('UPDATE vendedores SET ativo = 0 WHERE id_vendedor = ?', [idOk]);
    return await consultarVendedor(idOk);
  } catch (erro) {
    console.error('Erro ao desativar vendedor:', erro.message);
    throw erro;
  }
}

module.exports = {
  cadastrarVendedor,
  listarVendedores,
  consultarVendedor,
  atualizarVendedor,
  desativarVendedor,
};
