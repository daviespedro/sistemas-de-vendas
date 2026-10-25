const app = require('./app');
const conexao = require('./db');

const PORT = Number(process.env.PORT) || 3000;

async function iniciar() {
  try {
    // Testa a conexão antes de aceitar requisições
    await conexao.query('SELECT 1');
    console.log('Conexão com o MySQL estabelecida.');
  } catch (erro) {
    console.error('Não foi possível conectar ao MySQL:', erro.code || '', erro.message);
    console.error('Verifique o arquivo .env (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME) e se o MySQL está rodando.');
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`API de vendas rodando em http://localhost:${PORT}`));
}

iniciar();
