const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testar() {
  try {
    console.log('🔍 Testando conexão com o banco de dados...');
    console.log('📋 URL:', process.env.DATABASE_URL);
    
    const resultado = await pool.query('SELECT NOW()');
    console.log('✅ Conexão bem sucedida!');
    console.log('📅 Data/hora do banco:', resultado.rows[0]);
  } catch (erro) {
    console.error('❌ Erro na conexão:', erro.message);
    console.error('❌ Detalhes:', erro);
  }
}

testar();