const db = require('../config/db');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

exports.listar = (req, res) => {
    db.query('SELECT * FROM orcamentos ORDER BY id DESC', (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
};

exports.criar = (req, res) => {
    const { cliente_nome, descricao, valor } = req.body;

    db.query('INSERT INTO orcamentos (cliente_nome, descricao, valor) VALUES (?, ?, ?)',
        [cliente_nome, descricao, valor],
        (err, result) => {
            if (err) return res.status(500).json(err);
            res.json({ message: 'Orçamento criado!', id: result.insertId });
        }
    );
};

exports.gerarPDF = (req, res) => {
    const { id } = req.params;

    db.query('SELECT * FROM orcamentos WHERE id = ?', [id], (err, results) => {
        if (err) return res.status(500).json(err);
        if (results.length === 0) return res.status(404).json({ message: 'Orçamento não encontrado' });

        const orcamento = results[0];
        const doc = new PDFDocument();
        const filePath = path.join(__dirname, `../../orcamento_${orcamento.id}.pdf`);
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);
        doc.fontSize(20).text('Orçamento', { align: 'center' });
        doc.moveDown();
        doc.fontSize(14).text(`Cliente: ${orcamento.cliente_nome}`);
        doc.text(`Descrição: ${orcamento.descricao}`);
        doc.text(`Valor: R$ ${orcamento.valor}`);
        doc.text(`Data: ${new Date(orcamento.data_criacao).toLocaleDateString()}`);
        doc.end();

        stream.on('finish', () => {
            res.download(filePath, `orcamento_${orcamento.id}.pdf`, () => {
                fs.unlinkSync(filePath);
            });
        });
    });
};
