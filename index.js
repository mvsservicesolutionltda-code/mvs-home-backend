const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// 🔥 FORÇAR IPv4 (CORRIGE O ERRO ENETUNREACH)
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const app = express();
const port = process.env.PORT || 8080;

// Configurar banco de dados
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Configurar upload de fotos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens JPG, JPEG e PNG são permitidas'));
    }
  }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// ==================== ROTA DE TESTE ====================
app.get('/', (req, res) => {
  res.json({ mensagem: '✅ MVS HOME API funcionando!' });
});

// ==================== ROTAS DE USUÁRIO ====================

// CADASTRO
app.post('/api/register', async (req, res) => {
  try {
    console.log('📥 1. Recebendo requisição');
    console.log('📥 2. Body:', req.body);
    
    const { nome, cpf, data_nascimento, email, senha, endereco_completo } = req.body;
    console.log('📥 3. Dados extraídos:', { nome, cpf, email });

    // Validar campos obrigatórios
    if (!nome || !cpf || !data_nascimento || !email || !senha || !endereco_completo) {
      console.log('⚠️ Campos faltando!');
      return res.status(400).json({ erro: 'Todos os campos são obrigatórios' });
    }

    console.log('🔍 4. Verificando se usuário já existe...');
    console.log('🔍 4.1. Conectando ao banco...');
    
    try {
      console.log('🔍 4.2. Executando query...');
      const existe = await pool.query('SELECT * FROM usuarios WHERE email = $1 OR cpf = $2', [email, cpf]);
      console.log('🔍 5. Resultado da verificação:', existe.rows.length > 0 ? 'Usuário existe' : 'Usuário não existe');
      
      if (existe.rows.length > 0) {
        console.log('⚠️ 6. Usuário já existe!');
        return res.status(400).json({ erro: 'E-mail ou CPF já cadastrado' });
      }
    } catch (dbErro) {
      console.error('❌ ERRO NO BANCO DE DADOS:', dbErro);
      console.error('❌ Mensagem:', dbErro.message);
      console.error('❌ Stack:', dbErro.stack);
      return res.status(500).json({ erro: 'Erro no banco de dados: ' + dbErro.message });
    }

    console.log('🔐 7. Criptografando senha...');
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);
    console.log('🔐 8. Senha criptografada com sucesso');

    console.log('💾 9. Salvando no banco de dados...');
    const resultado = await pool.query(
      `INSERT INTO usuarios (nome, cpf, data_nascimento, email, senha, endereco_completo) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nome, email`,
      [nome, cpf, data_nascimento, email, senhaHash, endereco_completo]
    );
    
    console.log('✅ 10. Usuário cadastrado com sucesso:', resultado.rows[0]);
    res.status(201).json({ 
      mensagem: 'Usuário cadastrado com sucesso',
      usuario: resultado.rows[0]
    });
  } catch (erro) {
    console.error('❌ ERRO GERAL:', erro);
    console.error('❌ Mensagem:', erro.message);
    console.error('❌ Stack:', erro.stack);
    res.status(500).json({ erro: erro.message });
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  try {
    console.log('📥 Recebendo login:', req.body);
    const { email, senha } = req.body;

    // Validar campos
    if (!email || !senha) {
      console.log('⚠️ Email ou senha não fornecidos');
      return res.status(400).json({ erro: 'Email e senha são obrigatórios' });
    }

    console.log('🔍 Buscando usuário:', email);
    const resultado = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    console.log('🔍 Usuário encontrado:', resultado.rows.length > 0);

    if (resultado.rows.length === 0) {
      console.log('⚠️ Usuário não encontrado:', email);
      return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
    }

    const usuario = resultado.rows[0];
    
    // Verificar se a coluna 'senha' existe
    if (!usuario.senha) {
      console.log('⚠️ Usuário sem senha cadastrada');
      return res.status(500).json({ erro: 'Erro interno: usuário sem senha' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    console.log('🔐 Senha válida:', senhaValida);

    if (!senhaValida) {
      console.log('⚠️ Senha inválida para:', email);
      return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, nome: usuario.nome },
      process.env.JWT_SECRET || 'mvs_home_secret_2024',
      { expiresIn: '7d' }
    );

    console.log('✅ Login realizado:', email);
    res.json({
      mensagem: 'Login realizado com sucesso',
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        endereco: usuario.endereco_completo
      }
    });
  } catch (erro) {
    console.error('❌ Erro no login:', erro);
    console.error('❌ Mensagem:', erro.message);
    console.error('❌ Stack:', erro.stack);
    res.status(500).json({ erro: erro.message });
  }
});

// ==================== RECUPERAR SENHA ====================

// RECUPERAR SENHA - SOLICITAR LINK
app.post('/api/recuperar-senha', async (req, res) => {
  try {
    const { email } = req.body;
    console.log('📤 Recuperação de senha para:', email);

    // Verificar se o usuário existe
    const resultado = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    
    if (resultado.rows.length === 0) {
      console.log('⚠️ Usuário não encontrado:', email);
      return res.status(404).json({ erro: 'E-mail não encontrado' });
    }

    // Gerar token único para redefinição
    const token = jwt.sign(
      { email: email },
      process.env.JWT_SECRET || 'mvs_home_secret_2024',
      { expiresIn: '1h' }
    );

    console.log('✅ Token gerado para recuperação:', token);

    // 🔥 EM PRODUÇÃO, ENVIE UM EMAIL COM O LINK
    // Por enquanto, retornamos o link para teste
    res.json({
      mensagem: 'Link de recuperação enviado para o seu email',
      token: token,
      link: `https://mvs-home-backend.onrender.com/api/redefinir-senha?token=${token}`
    });

  } catch (erro) {
    console.error('❌ Erro na recuperação:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

// REDEFINIR SENHA
app.post('/api/redefinir-senha', async (req, res) => {
  try {
    const { token, nova_senha } = req.body;
    console.log('📤 Redefinindo senha com token:', token);

    // Verificar token
    let email;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'mvs_home_secret_2024');
      email = decoded.email;
    } catch (err) {
      console.log('⚠️ Token inválido ou expirado');
      return res.status(400).json({ erro: 'Token inválido ou expirado' });
    }

    // Criptografar nova senha
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(nova_senha, salt);

    // Atualizar senha no banco
    const resultado = await pool.query(
      'UPDATE usuarios SET senha = $1 WHERE email = $2 RETURNING id, nome, email',
      [senhaHash, email]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    console.log('✅ Senha redefinida com sucesso para:', email);
    res.json({
      mensagem: 'Senha redefinida com sucesso!',
      usuario: resultado.rows[0]
    });

  } catch (erro) {
    console.error('❌ Erro ao redefinir senha:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

// ==================== ROTAS DE PEDIDOS ====================

// CRIAR PEDIDO (com foto)
app.post('/api/orders', upload.single('foto'), async (req, res) => {
  try {
    console.log('📥 Criando pedido:', req.body);
    console.log('📥 Arquivo:', req.file);

    const { usuario_id, servico, descricao, endereco_reparo } = req.body;
    const foto_url = req.file ? `/uploads/${req.file.filename}` : null;

    const resultado = await pool.query(
      `INSERT INTO pedidos (usuario_id, servico, descricao, foto_url, endereco_reparo, status) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [usuario_id, servico, descricao, foto_url, endereco_reparo, 'aguardando_orcamento']
    );

    console.log('✅ Pedido criado:', resultado.rows[0]);
    res.status(201).json({
      mensagem: 'Pedido criado com sucesso! Aguardando orçamento.',
      pedido: resultado.rows[0]
    });
  } catch (erro) {
    console.error('❌ Erro ao criar pedido:', erro.message);
    res.status(500).json({ erro: erro.message });
  }
});

// LISTAR PEDIDOS DE UM USUÁRIO
app.get('/api/orders/usuario/:usuario_id', async (req, res) => {
  try {
    const { usuario_id } = req.params;
    const resultado = await pool.query(
      'SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY created_at DESC',
      [usuario_id]
    );
    res.json(resultado.rows);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// LISTAR TODOS OS PEDIDOS (Para o Admin)
app.get('/api/orders/all', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT p.*, u.nome as usuario_nome, u.email as usuario_email 
       FROM pedidos p 
       JOIN usuarios u ON p.usuario_id = u.id 
       ORDER BY p.created_at DESC`
    );
    res.json(resultado.rows);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ENVIAR ORÇAMENTO (Admin)
app.put('/api/orders/:id/orcamento', async (req, res) => {
  try {
    const { id } = req.params;
    const { valor, descricao } = req.body;

    const resultado = await pool.query(
      `UPDATE pedidos 
       SET orcamento_valor = $1, orcamento_descricao = $2, status = 'orcamento_enviado'
       WHERE id = $3 RETURNING *`,
      [valor, descricao, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Pedido não encontrado' });
    }

    res.json({
      mensagem: 'Orçamento enviado com sucesso!',
      pedido: resultado.rows[0]
    });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// APROVAR ORÇAMENTO (Cliente)
app.put('/api/orders/:id/aprovar', async (req, res) => {
  try {
    const { id } = req.params;
    const { aprovado } = req.body;

    const resultado = await pool.query(
      `UPDATE pedidos 
       SET orcamento_aprovado = $1, status = $2
       WHERE id = $3 RETURNING *`,
      [aprovado, aprovado ? 'aprovado' : 'recusado', id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Pedido não encontrado' });
    }

    res.json({
      mensagem: aprovado ? 'Orçamento aprovado!' : 'Orçamento recusado.',
      pedido: resultado.rows[0]
    });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ==================== INICIAR SERVIDOR ====================

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando em http://localhost:${port}`);
  console.log(`📋 Teste: http://localhost:${port}`);
});