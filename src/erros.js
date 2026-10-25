/**
 * Erro de negócio/validação com código HTTP associado.
 * As funções lançam ErroApp; o middleware da API converte em resposta JSON.
 */
class ErroApp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.name = 'ErroApp';
    this.status = status;
  }
}

/** Valida e converte um id vindo da URL/corpo para inteiro positivo. */
function validarId(valor, rotulo = 'id') {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ErroApp(400, `${rotulo} deve ser um inteiro positivo.`);
  }
  return n;
}

module.exports = { ErroApp, validarId };
