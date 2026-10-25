const conexao = require('./db');
const { ErroApp } = require('./erros');

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

const arredondar = (n) => Math.round((Number(n) || 0) * 100) / 100;

function validarData(valor, rotulo) {
  if (typeof valor !== 'string' || !REGEX_DATA.test(valor)) {
    throw new ErroApp(400, `${rotulo} é obrigatória no formato YYYY-MM-DD.`);
  }
  const d = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor) {
    throw new ErroApp(400, `${rotulo} inválida: ${valor}.`);
  }
  return valor;
}

/**
 * Consolida os indicadores de performance do período [inicio, fim] (datas inclusivas).
 * As metas mensais são avaliadas no mês de referência: por padrão o mês da data
 * inicial; pode ser escolhido com `mes` (YYYY-MM).
 *
 * @param {string} inicio YYYY-MM-DD
 * @param {string} fim    YYYY-MM-DD
 * @param {string} [mes]  YYYY-MM
 */
async function gerarRelatorioPerformance(inicio, fim, mes) {
  try {
    const dataInicio = validarData(inicio, 'inicio');
    const dataFim = validarData(fim, 'fim');
    if (dataInicio > dataFim) throw new ErroApp(400, 'inicio não pode ser posterior a fim.');

    let mesReferencia = dataInicio.slice(0, 7);
    if (mes !== undefined && mes !== '') {
      if (typeof mes !== 'string' || !REGEX_MES.test(mes)) {
        throw new ErroApp(400, 'mes deve estar no formato YYYY-MM.');
      }
      mesReferencia = mes;
    }
    const primeiroDiaMes = `${mesReferencia}-01`;

    // Filtro de período: fim inclusivo (< fim + 1 dia)
    const FILTRO = 'v.data_venda >= ? AND v.data_venda < DATE_ADD(?, INTERVAL 1 DAY)';
    const periodo = [dataInicio, dataFim];

    // 1) Totais gerais: COUNT, SUM, AVG
    const [totais] = await conexao.execute(
      `SELECT COUNT(*) AS total_vendas,
              COALESCE(SUM(v.valor_venda), 0)    AS valor_total,
              COALESCE(SUM(v.valor_comissao), 0) AS comissao_total,
              COALESCE(AVG(v.valor_comissao), 0) AS comissao_media
         FROM vendas v
        WHERE ${FILTRO}`,
      periodo
    );

    // 2) Vendas e comissão média por região: JOIN + GROUP BY + SUM/AVG/COUNT
    //    (LEFT JOIN para que regiões sem vendas apareçam zeradas)
    const [porRegiao] = await conexao.execute(
      `SELECT r.id_regiao, r.nome_regiao,
              COUNT(v.id_venda)                  AS quantidade_vendas,
              COALESCE(SUM(v.valor_venda), 0)    AS total_vendido,
              COALESCE(AVG(v.valor_comissao), 0) AS comissao_media
         FROM regioes r
         LEFT JOIN vendas v ON v.id_regiao = r.id_regiao
                           AND ${FILTRO}
        GROUP BY r.id_regiao, r.nome_regiao
        ORDER BY r.id_regiao`,
      periodo
    );

    // 3) Vendas por tipo de cliente: GROUP BY + SUM + COUNT
    const [porCliente] = await conexao.execute(
      `SELECT v.tipo_cliente,
              COUNT(*)           AS quantidade_vendas,
              SUM(v.valor_venda) AS total_vendido
         FROM vendas v
        WHERE ${FILTRO}
        GROUP BY v.tipo_cliente`,
      periodo
    );

    // 4) Desempenho por vendedor (melhor vendedor / maior comissão): JOIN + GROUP BY + SUM + COUNT
    const [porVendedor] = await conexao.execute(
      `SELECT ve.id_vendedor, ve.nome,
              COUNT(v.id_venda)  AS quantidade_vendas,
              SUM(v.valor_venda)    AS total_vendido,
              SUM(v.valor_comissao) AS comissao_acumulada
         FROM vendedores ve
         JOIN vendas v ON v.id_vendedor = ve.id_vendedor
        WHERE ${FILTRO}
        GROUP BY ve.id_vendedor, ve.nome`,
      periodo
    );

    // 5) Metas do mês de referência: JOIN + GROUP BY + SUM
    //    Considera vendedores ativos e também inativos que venderam no mês.
    const [metas] = await conexao.execute(
      `SELECT ve.id_vendedor, ve.nome, ve.meta_mensal,
              COALESCE(SUM(v.valor_venda), 0) AS total_vendido_mes
         FROM vendedores ve
         LEFT JOIN vendas v ON v.id_vendedor = ve.id_vendedor
                           AND v.data_venda >= ?
                           AND v.data_venda < DATE_ADD(?, INTERVAL 1 MONTH)
        GROUP BY ve.id_vendedor, ve.nome, ve.meta_mensal, ve.ativo
       HAVING ve.ativo = 1 OR COUNT(v.id_venda) > 0
        ORDER BY ve.id_vendedor`,
      [primeiroDiaMes, primeiroDiaMes]
    );

    const total = totais[0];

    // Garante PF e PJ sempre presentes no resultado
    const vendasPorTipoCliente = { PF: { quantidade_vendas: 0, total_vendido: 0 }, PJ: { quantidade_vendas: 0, total_vendido: 0 } };
    for (const l of porCliente) {
      vendasPorTipoCliente[l.tipo_cliente] = {
        quantidade_vendas: l.quantidade_vendas,
        total_vendido: arredondar(l.total_vendido),
      };
    }

    const porValor = [...porVendedor].sort((a, b) => b.total_vendido - a.total_vendido);
    const porComissao = [...porVendedor].sort((a, b) => b.comissao_acumulada - a.comissao_acumulada);
    const formatarVendedor = (l) => l && ({
      id_vendedor: l.id_vendedor,
      nome: l.nome,
      quantidade_vendas: l.quantidade_vendas,
      total_vendido: arredondar(l.total_vendido),
      comissao_acumulada: arredondar(l.comissao_acumulada),
    });

    const metasDetalhe = metas.map((m) => {
      const vendido = arredondar(m.total_vendido_mes);
      return {
        id_vendedor: m.id_vendedor,
        nome: m.nome,
        meta_mensal: m.meta_mensal,
        total_vendido_mes: vendido,
        percentual_atingido: m.meta_mensal > 0 ? arredondar((vendido / m.meta_mensal) * 100) : null,
        meta_atingida: m.meta_mensal > 0 && vendido >= m.meta_mensal,
      };
    });

    return {
      periodo: { inicio: dataInicio, fim: dataFim },
      total_vendas: total.total_vendas,
      valor_total_vendido: arredondar(total.valor_total),
      comissao_total: arredondar(total.comissao_total),
      comissao_media_geral: arredondar(total.comissao_media),
      vendas_por_regiao: porRegiao.map((r) => ({
        id_regiao: r.id_regiao,
        nome_regiao: r.nome_regiao,
        quantidade_vendas: r.quantidade_vendas,
        total_vendido: arredondar(r.total_vendido),
      })),
      comissao_media_por_regiao: porRegiao.map((r) => ({
        id_regiao: r.id_regiao,
        nome_regiao: r.nome_regiao,
        comissao_media: arredondar(r.comissao_media),
      })),
      vendas_por_tipo_cliente: vendasPorTipoCliente,
      melhor_vendedor: formatarVendedor(porValor[0]) || null,
      maior_comissao: formatarVendedor(porComissao[0]) || null,
      metas: {
        mes_referencia: mesReferencia,
        metas_atingidas: metasDetalhe.filter((m) => m.meta_atingida).length,
        total_vendedores_avaliados: metasDetalhe.length,
        detalhe: metasDetalhe,
      },
    };
  } catch (erro) {
    console.error('Erro ao gerar relatório de performance:', erro.message);
    throw erro;
  }
}

module.exports = { gerarRelatorioPerformance };
