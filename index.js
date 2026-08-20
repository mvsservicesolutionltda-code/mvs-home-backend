const pdf = require('html-pdf');

// GERAR RELATÓRIO PDF (versão completa)
app.post('/api/relatorio-pdf', async (req, res) => {
  try {
    const { pedidos } = req.body;
    
    // Criar HTML do relatório
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Relatório de Pedidos - MVS HOME</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #1A3B5D; text-align: center; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h2 { color: #E67E22; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #1A3B5D; color: white; padding: 10px; text-align: left; }
          td { padding: 8px; border: 1px solid #ddd; }
          .status { font-weight: bold; }
          .total { margin-top: 20px; text-align: right; font-size: 18px; }
          .footer { margin-top: 30px; text-align: center; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🏠 MVS HOME</h1>
          <h2>Relatório de Pedidos</h2>
          <p>Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Cliente</th>
              <th>Serviço</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Avaliação</th>
            </tr>
          </thead>
          <tbody>
    `;

    pedidos.forEach(p => {
      const estrelas = p.avaliacao ? '⭐'.repeat(p.avaliacao) : '-';
      html += `
        <tr>
          <td>#${p.id}</td>
          <td>${p.usuario_nome}</td>
          <td>${p.servico}</td>
          <td>${p.descricao}</td>
          <td>${p.orcamento_valor ? `R$ ${parseFloat(p.orcamento_valor).toFixed(2)}` : '-'}</td>
          <td><span class="status">${p.status}</span></td>
          <td>${estrelas}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <div class="total">
          <strong>Total de Pedidos: ${pedidos.length}</strong>
        </div>
        <div class="footer">
          <p>Relatório gerado automaticamente pelo sistema MVS HOME</p>
        </div>
      </body>
      </html>
    `;

    // Gerar PDF
    pdf.create(html).toBuffer((err, buffer) => {
      if (err) {
        console.error('Erro ao gerar PDF:', err);
        return res.status(500).json({ erro: 'Erro ao gerar PDF' });
      }
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=relatorio_pedidos_${Date.now()}.pdf`);
      res.send(buffer);
    });
    
  } catch (erro) {
    console.error('❌ Erro ao gerar relatório:', erro);
    res.status(500).json({ erro: erro.message });
  }
});