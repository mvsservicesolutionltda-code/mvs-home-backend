const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const app = express();
const port = process.env.PORT || 8080;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
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
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Apenas imagens JPG, JPEG e PNG'));
  }
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// ========== ROTA DE TESTE ==========
app.get('/', (req, res) => {
  res.json({ mensagem: '✅ MVS HOME API funcionando!' });
});

// ========== ROTAS DE USUÁRIO ==========
app.post('/api/register', async (req, res) => {
  try {
    const { nome, cpf, data_nascimento, email, senha, endereco_completo, telefone } = req.body;
    if (!nome || !cpf || !data_nascimento || !email || !senha || !endereco_completo) {
      return res.status(400).json({ erro: 'Todos os campos são obrigatórios' });
    }
    const existe = await pool.query('SELECT * FROM usuarios WHERE email = $1 OR cpf = $2', [email, cpf]);
    if (existe.rows.length > 0) {
      return res.status(400).json({ erro: 'E-mail ou CPF já cadastrado' });
    }
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);
    const resultado = await pool.query(
      `INSERT INTO usuarios (nome, cpf, data_nascimento, email, senha, endereco_completo, telefone) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, nome, email, cpf, telefone, endereco_completo`,
      [nome, cpf, data_nascimento, email, senhaHash, endereco_completo, telefone || null]
    );
    res.status(201).json({ mensagem: 'Usuário cadastrado com sucesso', usuario: resultado.rows[0] });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: 'Email e senha são obrigatórios' });
    const resultado = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (resultado.rows.length === 0) return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
    const usuario = resultado.rows[0];
    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, nome: usuario.nome },
      process.env.JWT_SECRET || 'mvs_home_secret_2024',
      { expiresIn: '7d' }
    );
    res.json({
      mensagem: 'Login realizado com sucesso',
      token,
      usuario: { 
        id: usuario.id, 
        nome: usuario.nome, 
        email: usuario.email, 
        endereco: usuario.endereco_completo,
        cpf: usuario.cpf,
        telefone: usuario.telefone
      }
    });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ========== RECUPERAR SENHA ==========
app.post('/api/recuperar-senha', async (req, res) => {
  try {
    const { email } = req.body;
    const resultado = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'E-mail não encontrado' });
    const token = jwt.sign({ email }, process.env.JWT_SECRET || 'mvs_home_secret_2024', { expiresIn: '1h' });
    res.json({
      mensagem: 'Link de recuperação enviado para o seu email',
      token,
      link: `https://mvs-home-backend.onrender.com/api/redefinir-senha?token=${token}`
    });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.post('/api/redefinir-senha', async (req, res) => {
  try {
    const { token, nova_senha } = req.body;
    let email;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'mvs_home_secret_2024');
      email = decoded.email;
    } catch {
      return res.status(400).json({ erro: 'Token inválido ou expirado' });
    }
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(nova_senha, salt);
    const resultado = await pool.query(
      'UPDATE usuarios SET senha = $1 WHERE email = $2 RETURNING id, nome, email',
      [senhaHash, email]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });
    res.json({ mensagem: 'Senha redefinida com sucesso!', usuario: resultado.rows[0] });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ========== ROTAS DE PEDIDOS ==========

// CRIAR PEDIDO
app.post('/api/orders', upload.single('foto'), async (req, res) => {
  try {
    const { usuario_id, servico, descricao, endereco_reparo, material } = req.body;
    const foto_url = req.file ? `/uploads/${req.file.filename}` : null;
    
    const resultado = await pool.query(
      `INSERT INTO pedidos (usuario_id, servico, descricao, foto_url, endereco_reparo, material, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [usuario_id, servico, descricao, foto_url, endereco_reparo, material || 'cliente_nao_informou', 'aguardando_orcamento']
    );
    
    res.status(201).json({
      mensagem: 'Pedido criado com sucesso!',
      pedido: resultado.rows[0]
    });
  } catch (erro) {
    console.error('❌ Erro ao criar pedido:', erro.message);
    res.status(500).json({ erro: erro.message });
  }
});

// LISTAR PEDIDOS DO USUÁRIO
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

// LISTAR TODOS OS PEDIDOS (ADMIN)
app.get('/api/orders/all', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT p.*, u.nome as usuario_nome, u.email as usuario_email, u.cpf, u.telefone, u.endereco_completo
       FROM pedidos p 
       JOIN usuarios u ON p.usuario_id = u.id 
       ORDER BY p.created_at DESC`
    );
    res.json(resultado.rows);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ========== ORÇAMENTO ==========
app.put('/api/orders/:id/orcamento', async (req, res) => {
  try {
    const { id } = req.params;
    const { valor, descricao, tecnico_nome, tecnico_telefone, data_servico, horario_servico, materiais } = req.body;
    if (!valor || !descricao) {
      return res.status(400).json({ erro: 'Valor e descrição são obrigatórios' });
    }
    const pedidoExiste = await pool.query('SELECT * FROM pedidos WHERE id = $1', [id]);
    if (pedidoExiste.rows.length === 0) return res.status(404).json({ erro: 'Pedido não encontrado' });
    
    const resultado = await pool.query(
      `UPDATE pedidos 
       SET orcamento_valor = $1, orcamento_descricao = $2, 
           status = 'orcamento_enviado',
           tecnico_nome = $3, tecnico_telefone = $4,
           data_servico = $5, horario_servico = $6,
           materiais_usados = $7
       WHERE id = $8 RETURNING *`,
      [valor, descricao, tecnico_nome || null, tecnico_telefone || null, data_servico || null, horario_servico || null, materiais || [], id]
    );
    res.json({ mensagem: 'Orçamento enviado com sucesso!', pedido: resultado.rows[0] });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// APROVAR ORÇAMENTO
app.put('/api/orders/:id/aprovar', async (req, res) => {
  try {
    const { id } = req.params;
    const { aprovado } = req.body;
    const resultado = await pool.query(
      `UPDATE pedidos SET orcamento_aprovado = $1, status = $2, data_inicio = NOW() WHERE id = $3 RETURNING *`,
      [aprovado, aprovado ? 'aprovado' : 'recusado', id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Pedido não encontrado' });
    res.json({ mensagem: aprovado ? 'Orçamento aprovado!' : 'Orçamento recusado.', pedido: resultado.rows[0] });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// INICIAR SERVIÇO
app.put('/api/orders/:id/iniciar', async (req, res) => {
  try {
    const { id } = req.params;
    const { tecnico_id } = req.body;
    const resultado = await pool.query(
      `UPDATE pedidos SET status = 'em_andamento', data_inicio = NOW(), tecnico_id = $1 WHERE id = $2 RETURNING *`,
      [tecnico_id || null, id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Pedido não encontrado' });
    res.json({ mensagem: 'Serviço iniciado!', pedido: resultado.rows[0] });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// FINALIZAR SERVIÇO
app.put('/api/orders/:id/finalizar', async (req, res) => {
  try {
    const { id } = req.params;
    const { avaliacao, comentario, materiais_usados, valor_total } = req.body;
    const resultado = await pool.query(
      `UPDATE pedidos SET 
        status = 'finalizado', 
        avaliacao = $1, 
        comentario = $2,
        materiais_usados = $3,
        valor_total = $4,
        data_fim = NOW()
       WHERE id = $5 RETURNING *`,
      [avaliacao, comentario, materiais_usados || [], valor_total || 0, id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Pedido não encontrado' });
    res.json({ mensagem: 'Serviço finalizado!', pedido: resultado.rows[0] });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ARQUIVAR PEDIDO
app.put('/api/orders/:id/arquivar', async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE pedidos SET status = $1 WHERE id = $2 RETURNING *',
      ['arquivado', id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Pedido não encontrado' });
    res.json({ mensagem: 'Pedido arquivado!', pedido: resultado.rows[0] });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// EXCLUIR PEDIDO
app.delete('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query('DELETE FROM pedidos WHERE id = $1 RETURNING *', [id]);
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Pedido não encontrado' });
    res.json({ mensagem: 'Pedido excluído!', pedido: resultado.rows[0] });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ========== ROTAS DE TÉCNICOS ==========
app.get('/api/tecnicos', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM tecnicos ORDER BY nome');
    res.json(resultado.rows);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.post('/api/tecnicos', async (req, res) => {
  try {
    const { nome, telefone, especialidade } = req.body;
    const resultado = await pool.query(
      'INSERT INTO tecnicos (nome, telefone, especialidade) VALUES ($1, $2, $3) RETURNING *',
      [nome, telefone, especialidade]
    );
    res.status(201).json({ mensagem: 'Técnico cadastrado!', tecnico: resultado.rows[0] });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ========== ROTAS DE MATERIAIS ==========
app.get('/api/materiais', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM materiais ORDER BY nome');
    res.json(resultado.rows);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.post('/api/materiais', async (req, res) => {
  try {
    const { nome, descricao, preco_unitario } = req.body;
    const resultado = await pool.query(
      'INSERT INTO materiais (nome, descricao, preco_unitario) VALUES ($1, $2, $3) RETURNING *',
      [nome, descricao, preco_unitario || 0]
    );
    res.status(201).json({ mensagem: 'Material cadastrado!', material: resultado.rows[0] });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ========== ROTAS DE ESTATÍSTICAS ==========
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const totalPedidos = await pool.query('SELECT COUNT(*) FROM pedidos');
    const pendentes = await pool.query("SELECT COUNT(*) FROM pedidos WHERE status = 'aguardando_orcamento'");
    const emAndamento = await pool.query("SELECT COUNT(*) FROM pedidos WHERE status = 'em_andamento'");
    const finalizados = await pool.query("SELECT COUNT(*) FROM pedidos WHERE status = 'finalizado'");
    const valorTotal = await pool.query("SELECT SUM(orcamento_valor) FROM pedidos WHERE status = 'finalizado' OR status = 'em_andamento'");
    
    res.json({
      total: parseInt(totalPedidos.rows[0].count),
      pendentes: parseInt(pendentes.rows[0].count),
      emAndamento: parseInt(emAndamento.rows[0].count),
      finalizados: parseInt(finalizados.rows[0].count),
      valorTotal: parseFloat(valorTotal.rows[0].sum) || 0
    });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando em http://localhost:${port}`);
});
// ========== ROTAS DE TÉCNICOS ==========
app.get('/api/tecnicos', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM tecnicos ORDER BY nome');
    res.json(resultado.rows);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

app.post('/api/tecnicos', async (req, res) => {
  try {
    const { nome, telefone, especialidade } = req.body;
    if (!nome || nome.trim() === '') {
      return res.status(400).json({ erro: 'Nome é obrigatório' });
    }
    const resultado = await pool.query(
      'INSERT INTO tecnicos (nome, telefone, especialidade) VALUES ($1, $2, $3) RETURNING *',
      [nome.trim(), telefone || null, especialidade || null]
    );
    res.status(201).json({ mensagem: 'Técnico cadastrado!', tecnico: resultado.rows[0] });
  } catch (erro) {
    console.error('Erro ao cadastrar técnico:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

app.delete('/api/tecnicos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query('DELETE FROM tecnicos WHERE id = $1 RETURNING *', [id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Técnico não encontrado' });
    }
    res.json({ mensagem: 'Técnico removido!', tecnico: resultado.rows[0] });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});