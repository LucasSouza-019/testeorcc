const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const db = require("../config/db");
const PDFDocument = require("pdfkit");

/* ===================== DADOS DA EMPRESA (edite aqui) ===================== */
const EMPRESA = {
  nome: "FUNILARIA E PINTURA PUMA",
  endereco:
    "Avenida Alfredo Contato, 2441 - Vila Ferrarezi - Santa B. D’Oeste / SP",
  telefone: "(19) 98153-1546",
};
/* ======================================================================== */

/* ================================ HELPERS =============================== */
function calcTotais(itens = [], servicos = []) {
  const totItens = itens.reduce(
    (s, it) => s + Number(it.qtd || 1) * Number(it.unitario || 0),
    0
  );
  const totMO = servicos.reduce((s, sv) => s + Number(sv.valor || 0), 0);
  return { totItens, totMO, total: Number((totItens + totMO).toFixed(2)) };
}
function brl(n) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(n || 0));
}
function safe(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}
/* ======================================================================== */

/* ========================== ROTAS DE ORÇAMENTOS ========================= */

// LISTAR (resumo)
router.get("/", (req, res) => {
  const { q } = req.query;

  let sql = `
    SELECT id,
           cliente_nome AS cliente,
           descricao,
           total AS valor,
           data_criacao
    FROM orcamentos`;
  const params = [];

  if (q) {
    if (/^\d+$/.test(q)) {
      sql += " WHERE id = ?";
      params.push(q);
    } else {
      sql += " WHERE cliente_nome LIKE ?";
      params.push(`%${q}%`);
    }
  }

  sql += " ORDER BY id DESC";

  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: "Erro ao listar" });
    res.json(rows);
  });
});

// DETALHAR (com itens e serviços)
router.get("/:id", (req, res) => {
  const { id } = req.params;
  const getOrc = `SELECT * FROM orcamentos WHERE id = ?`;
  const getItens = `SELECT id, qtd, descricao, unitario, total FROM orcamento_itens WHERE orcamento_id = ?`;
  const getServ = `SELECT id, descricao, valor FROM orcamento_servicos WHERE orcamento_id = ?`;

  db.query(getOrc, [id], (e1, r1) => {
    if (e1) return res.status(500).json({ error: "Erro ao buscar orçamento" });
    if (!r1.length) return res.status(404).json({ error: "Não encontrado" });
    const o = r1[0];
    db.query(getItens, [id], (e2, itens) => {
      if (e2) return res.status(500).json({ error: "Erro ao buscar itens" });
      db.query(getServ, [id], (e3, servicos) => {
        if (e3) return res.status(500).json({ error: "Erro ao buscar serviços" });
        res.json({ ...o, itens, servicos });
      });
    });
  });
});

/* ===================== CRIAR (usa conexão do pool) ===================== */
router.post("/", (req, res) => {
  const {
    cliente,
    telefone,
    descricao,
    carro_marca,
    carro_modelo,
    carro_placa,
    carro_ano,
    forma_pagamento,
    itens = [],
    mao_obra = [],
    valor,
  } = req.body;

  if (!cliente) return res.status(400).json({ error: "Informe o cliente" });

  const { total } =
    itens.length || mao_obra.length
      ? calcTotais(itens, mao_obra)
      : { total: Number(valor || 0) };

  const insertOrc = `
    INSERT INTO orcamentos (
      cliente_nome, telefone, descricao,
      carro_marca, carro_modelo, carro_placa, carro_ano,
      forma_pagamento, total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.getConnection((err, conn) => {
    if (err) return res.status(500).json({ error: "Falha na conexão" });

    conn.beginTransaction((err) => {
      if (err) {
        conn.release();
        return res.status(500).json({ error: "Falha ao iniciar transação" });
      }

      conn.query(
        insertOrc,
        [
          cliente,
          telefone || null,
          descricao || "",
          carro_marca || null,
          carro_modelo || null,
          carro_placa || null,
          carro_ano || null,
          forma_pagamento || null,
          total,
        ],
        (e1, r1) => {
          if (e1) {
            return conn.rollback(() => {
              conn.release();
              res.status(500).json({ error: "Erro ao criar orçamento" });
            });
          }

          const orcId = r1.insertId;

          const insertItens = () => {
            if (!itens.length) return insertServicos();
            const values = itens.map((it) => [
              orcId,
              safe(it.qtd || 1),
              it.descricao || "",
              safe(it.unitario || 0),
              Number((safe(it.qtd || 1) * safe(it.unitario || 0)).toFixed(2)),
            ]);
            conn.query(
              "INSERT INTO orcamento_itens (orcamento_id, qtd, descricao, unitario, total) VALUES ?",
              [values],
              (e2) => {
                if (e2)
                  return conn.rollback(() => {
                    conn.release();
                    res.status(500).json({ error: "Erro ao salvar itens" });
                  });
                insertServicos();
              }
            );
          };

          const insertServicos = () => {
            if (!mao_obra.length) return commitAll();
            const values = mao_obra.map((sv) => [
              orcId,
              sv.descricao || "",
              safe(sv.valor || 0),
            ]);
            conn.query(
              "INSERT INTO orcamento_servicos (orcamento_id, descricao, valor) VALUES ?",
              [values],
              (e3) => {
                if (e3)
                  return conn.rollback(() => {
                    conn.release();
                    res.status(500).json({ error: "Erro ao salvar serviços" });
                  });
                commitAll();
              }
            );
          };

          const commitAll = () => {
            conn.commit((e4) => {
              if (e4)
                return conn.rollback(() => {
                  conn.release();
                  res.status(500).json({ error: "Erro ao finalizar transação" });
                });
              conn.release();
              res.json({ id: orcId, cliente, total });
            });
          };

          insertItens();
        }
      );
    });
  });
});

/* ===================== ATUALIZAR (usa conexão do pool) ===================== */
router.put("/:id", (req, res) => {
  const { id } = req.params;
  const {
    cliente,
    telefone,
    descricao,
    carro_marca,
    carro_modelo,
    carro_placa,
    carro_ano,
    forma_pagamento,
    itens = [],
    mao_obra = [],
  } = req.body;

  const { total } = calcTotais(itens, mao_obra);

  db.getConnection((err, conn) => {
    if (err) return res.status(500).json({ error: "Falha na conexão" });

    conn.beginTransaction((err) => {
      if (err) {
        conn.release();
        return res.status(500).json({ error: "Falha ao iniciar transação" });
      }

      const upOrc = `UPDATE orcamentos SET
        cliente_nome=?, telefone=?, descricao=?, carro_marca=?, carro_modelo=?, carro_placa=?, carro_ano=?, forma_pagamento=?, total=?
        WHERE id = ?`;

      conn.query(
        upOrc,
        [
          cliente,
          telefone,
          descricao,
          carro_marca,
          carro_modelo,
          carro_placa,
          carro_ano,
          forma_pagamento,
          total,
          id,
        ],
        (e1, r1) => {
          if (e1) {
            return conn.rollback(() => {
              conn.release();
              res.status(500).json({ error: "Erro ao atualizar orçamento" });
            });
          }
          if (r1.affectedRows === 0) {
            return conn.rollback(() => {
              conn.release();
              res.status(404).json({ error: "Não encontrado" });
            });
          }

          conn.query(
            "DELETE FROM orcamento_itens WHERE orcamento_id = ?",
            [id],
            (e2) => {
              if (e2)
                return conn.rollback(() => {
                  conn.release();
                  res.status(500).json({ error: "Erro ao limpar itens" });
                });

              conn.query(
                "DELETE FROM orcamento_servicos WHERE orcamento_id = ?",
                [id],
                (e3) => {
                  if (e3)
                    return conn.rollback(() => {
                      conn.release();
                      res.status(500).json({ error: "Erro ao limpar serviços" });
                    });

                  const insertItens = () => {
                    if (!itens.length) return insertServicos();
                    const values = itens.map((it) => [
                      id,
                      safe(it.qtd || 1),
                      it.descricao || "",
                      safe(it.unitario || 0),
                      Number((safe(it.qtd || 1) * safe(it.unitario || 0)).toFixed(2)),
                    ]);
                    conn.query(
                      "INSERT INTO orcamento_itens (orcamento_id, qtd, descricao, unitario, total) VALUES ?",
                      [values],
                      (e4) => {
                        if (e4)
                          return conn.rollback(() => {
                            conn.release();
                            res.status(500).json({ error: "Erro ao salvar itens" });
                          });
                        insertServicos();
                      }
                    );
                  };

                  const insertServicos = () => {
                    if (!mao_obra.length) return commitAll();
                    const values = mao_obra.map((sv) => [
                      id,
                      sv.descricao || "",
                      safe(sv.valor || 0),
                    ]);
                    conn.query(
                      "INSERT INTO orcamento_servicos (orcamento_id, descricao, valor) VALUES ?",
                      [values],
                      (e5) => {
                        if (e5)
                          return conn.rollback(() => {
                            conn.release();
                            res
                              .status(500)
                              .json({ error: "Erro ao salvar serviços" });
                          });
                        commitAll();
                      }
                    );
                  };

                  const commitAll = () =>
                    conn.commit((e6) => {
                      if (e6)
                        return conn.rollback(() => {
                          conn.release();
                          res
                            .status(500)
                            .json({ error: "Erro ao finalizar transação" });
                        });
                      conn.release();
                      res.json({ success: true, id: Number(id), total });
                    });

                  insertServicos();
                }
              );
            }
          );
        }
      );
    });
  });
});

/* =============================== EXCLUIR =============================== */
router.delete("/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM orcamentos WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ error: "Erro ao excluir" });
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Não encontrado" });
    res.json({ success: true });
  });
});

/* ============================== PDF AVANÇADO ============================= */
router.get("/:id/pdf", (req, res) => {
  const { id } = req.params;

  const sqlOrc = `SELECT id, cliente_nome AS cliente, telefone, descricao, total,
                         carro_marca, carro_modelo, carro_placa, carro_ano,
                         forma_pagamento, data_criacao
                  FROM orcamentos WHERE id = ?`;
  const sqlItens = `SELECT qtd, descricao, unitario, total FROM orcamento_itens WHERE orcamento_id = ?`;
  const sqlServ = `SELECT descricao, valor FROM orcamento_servicos WHERE orcamento_id = ?`;

  db.query(sqlOrc, [id], (e1, r1) => {
    if (e1 || !r1.length) return res.status(404).json({ error: "Não encontrado" });
    const o = r1[0];
    db.query(sqlItens, [id], (e2, itens = []) => {
      db.query(sqlServ, [id], (e3, servicos = []) => {
        const doc = new PDFDocument({ size: "A4", margin: 40 });
        const logoPath = path.resolve(__dirname, "../../public/logo.png");

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=orcamento_${o.id}.pdf`
        );
        doc.pipe(res);

        // ===== Cabeçalho
        const hasLogo = fs.existsSync(logoPath);
        if (hasLogo) {
          try {
            doc.image(logoPath, 40, 40, { width: 100 });
          } catch {}
        }
        doc
          .fontSize(16)
          .text(EMPRESA.nome, hasLogo ? 150 : 40, 40, { continued: false, bold: true });
        doc
          .fontSize(10)
          .text(EMPRESA.endereco)
          .text(EMPRESA.telefone)
          .moveDown(0.5);
        doc
          .fontSize(14)
          .text(`ORÇAMENTO #${o.id}`, { align: "right" })
          .moveDown(0.5);

        // ===== Dados do cliente / veículo
        doc
          .rect(40, doc.y, 515, 70)
          .stroke()
          .fontSize(11)
          .text(`Cliente: ${o.cliente || "-"}`, 50, doc.y + 10)
          .text(`Telefone: ${o.telefone || "-"}`)
          .text(
            `Veículo: ${[
              o.carro_marca,
              o.carro_modelo,
              o.carro_ano ? `ano ${o.carro_ano}` : "",
              o.carro_placa ? `placa ${o.carro_placa}` : "",
            ]
              .filter(Boolean)
              .join(" ")}`
          )
          .text(`Forma de pagamento: ${o.forma_pagamento || "-"}`);

        doc.moveDown(2);

        // ===== Tabela de Itens
        const startY = doc.y + 5;
        doc.fontSize(12).text("Peças / Itens", 40, startY);
        doc.moveTo(40, startY + 16).lineTo(555, startY + 16).stroke();

        const cols = [
          { k: "qtd", title: "Qtd", w: 60, align: "right" },
          { k: "descricao", title: "Descrição", w: 320 },
          { k: "unitario", title: "Unitário", w: 85, align: "right", fmt: brl },
          { k: "total", title: "Subtotal", w: 85, align: "right", fmt: brl },
        ];

        function tableHeader(y) {
          let x = 40;
          doc.fontSize(10).fillColor("#000");
          cols.forEach((c) => {
            doc.text(c.title, x, y, {
              width: c.w,
              align: c.align || "left",
            });
            x += c.w + 5;
          });
        }
        function tableRow(row, y) {
          let x = 40;
          cols.forEach((c) => {
            const v = c.fmt ? c.fmt(row[c.k]) : row[c.k];
            doc.text(String(v ?? ""), x, y, {
              width: c.w,
              align: c.align || "left",
            });
            x += c.w + 5;
          });
        }

        let y = startY + 22;
        tableHeader(y);
        y += 14;
        (itens || []).forEach((it) => {
          if (y > 760) {
            doc.addPage();
            y = 50;
            tableHeader(y);
            y += 14;
          }
          tableRow(
            {
              qtd: safe(it.qtd || 1),
              descricao: it.descricao || "",
              unitario: safe(it.unitario || 0),
              total: safe(it.total || safe(it.qtd || 1) * safe(it.unitario || 0)),
            },
            y
          );
          y += 14;
        });

        // ===== Serviços
        y += 14;
        if (y > 760) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(12).text("Serviços", 40, y);
        doc.moveTo(40, y + 16).lineTo(555, y + 16).stroke();

        const colsServ = [
          { k: "descricao", title: "Descrição", w: 405 },
          { k: "valor", title: "Valor", w: 120, align: "right", fmt: brl },
        ];

        function servHeader(yy) {
          let x = 40;
          doc.fontSize(10);
          colsServ.forEach((c) => {
            doc.text(c.title, x, yy, { width: c.w, align: c.align || "left" });
            x += c.w + 5;
          });
        }
        function servRow(row, yy) {
          let x = 40;
          colsServ.forEach((c) => {
            const v = c.fmt ? c.fmt(row[c.k]) : row[c.k];
            doc.text(String(v ?? ""), x, yy, {
              width: c.w,
              align: c.align || "left",
            });
            x += c.w + 5;
          });
        }

        y += 22;
        servHeader(y);
        y += 14;
        (servicos || []).forEach((sv) => {
          if (y > 760) {
            doc.addPage();
            y = 50;
            servHeader(y);
            y += 14;
          }
          servRow({ descricao: sv.descricao || "", valor: safe(sv.valor || 0) }, y);
          y += 14;
        });

        // ===== Totais
        const { totItens, totMO, total } = calcTotais(itens || [], servicos || []);
        y += 18;
        if (y > 740) {
          doc.addPage();
          y = 50;
        }
        doc
          .fontSize(12)
          .text("Totais", 40, y)
          .moveTo(40, y + 16)
          .lineTo(555, y + 16)
          .stroke();

        y += 20;
        doc
          .fontSize(11)
          .text(`Peças / Itens: ${brl(totItens)}`, 40, y)
          .text(`Serviços: ${brl(totMO)}`, 40, y + 16)
          .font("Helvetica-Bold")
          .text(`TOTAL: ${brl(total)}`, 400, y + 8, { align: "right" })
          .font("Helvetica");

        // ===== Observações
        y += 48;
        if (o.descricao) {
          doc
            .fontSize(11)
            .text("Observações:", 40, y)
            .fontSize(10)
            .text(o.descricao, 40, y + 16, { width: 515 });
        }

        // ===== Rodapé
        doc.fontSize(9).text("Documento gerado automaticamente.", 40, 800, {
          align: "center",
          width: 515,
        });

        doc.end();
      });
    });
  });
});

module.exports = router;
