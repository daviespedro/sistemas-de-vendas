const { ErroApp } = require('./erros');

// Bônus por tipo de cliente (%). Bônus por região vem da tabela `regioes`.
const BONUS_CLIENTE = Object.freeze({ PF: 2, PJ: 3 });

/**
 * Única implementação da regra de comissão (não duplicar em outro lugar).
 *
 * Comissão total = valor_venda × (percentual_base + bônus_cliente + bônus_região) / 100
 * Os percentuais são SOMADOS (sem composição).
 *
 * Exemplo: R$ 2.000,00, PJ, Norte, base 5% -> 5 + 3 + 1 = 9% -> R$ 180,00
 *
 * @param {number} valorVenda       valor da venda em R$ (> 0)
 * @param {number} percentualBase   comissão base do vendedor (%)
 * @param {'PF'|'PJ'} tipoCliente   tipo do cliente
 * @param {number} percentualRegiao bônus da região (%)
 * @returns {Promise<{percentualCliente:number, percentualTotal:number, valorComissao:number}>}
 */
async function calcularComissao(valorVenda, percentualBase, tipoCliente, percentualRegiao) {
  try {
    const valor = Number(valorVenda);
    const base = Number(percentualBase);
    const regiao = Number(percentualRegiao);

    if (!Number.isFinite(valor) || valor <= 0) {
      throw new ErroApp(400, 'valor_venda deve ser um número positivo.');
    }
    if (!Number.isFinite(base) || !Number.isFinite(regiao)) {
      throw new ErroApp(400, 'Percentuais de comissão inválidos.');
    }
    if (!Object.prototype.hasOwnProperty.call(BONUS_CLIENTE, tipoCliente)) {
      throw new ErroApp(400, "tipo_cliente deve ser 'PF' ou 'PJ'.");
    }

    const percentualCliente = BONUS_CLIENTE[tipoCliente];
    // arredonda para evitar ruído de ponto flutuante (ex.: 5.5 + 2 + 0.5)
    const percentualTotal = Math.round((base + percentualCliente + regiao) * 100) / 100;
    // trabalha em centavos: valor × % / 100 -> arredonda para 2 casas
    const valorComissao = Math.round(valor * percentualTotal + Number.EPSILON) / 100;

    return { percentualCliente, percentualTotal, valorComissao };
  } catch (erro) {
    if (!(erro instanceof ErroApp)) console.error('Erro ao calcular comissão:', erro.message);
    throw erro;
  }
}

module.exports = { calcularComissao, BONUS_CLIENTE };
