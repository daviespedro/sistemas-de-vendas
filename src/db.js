require('dotenv').config();
const mysql = require('mysql2/promise');

// Credenciais SEMPRE via variáveis de ambiente (.env), nunca no código-fonte.
const conexao = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'db_vendas',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true, // DECIMAL/SUM/AVG chegam como number, não como string
  dateStrings: true, // DATETIME chega como 'YYYY-MM-DD HH:mm:ss' (sem surpresas de fuso)
});

module.exports = conexao;
