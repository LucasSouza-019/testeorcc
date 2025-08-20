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

const brl = (n) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(n || 0)
  );
const num = (v, d = 2) => Number(Number(v || 0).toFixed(d));
const sum = (arr) => arr.reduce((s, n) => s + num(n), 0);

/* Calcula totais a partir dos arrays enviados pelo front */
function calcTotais(itens = [], servicos = []) {
  const totItens = sum(
    itens.map((it) =>
      it.subtotal != null ? it.subtotal : num(it.qtd || 1) * num(it.unitario || 0)
    )
  );
  const totServ = sum(servicos.map((s) => s.valor || 0));
  const totalGeral = num(totItens + totServ);
  return { totItens: num(totItens), totServ: num(totServ), totalGeral };
}

/* ============================= LISTAR ============================= */
router.get("/", (req, res) => {
  const { q } = req.query;

  let sql = `
    SELECT 
      id,
      cliente_nome AS cliente,
      total_geral AS valor,
      COALESCE(criado_em, data_criacao) AS data_criacao
    FROM orcamentos
  `;
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
    if (err) {
      console.error("LIST ERR:", err);
      return res.status(500).json({ error: err.sqlMessage || String(err) });
    }
    res.json(rows);
  });
});

/* ============================ DETALHAR ============================ */
router.get("/:id", (req, res) => {
  const { id } = req.params;

  const sqlOrc = `
    SELECT id, cliente_nome, telefone, placa, observacoes,
           total_itens, total_servicos, total_geral,
           COALESCE(criado_em, data_criacao) AS data_criacao
    FROM orcamentos WHERE id = ?
  `;
  const sqlItens = `
    SELECT id, descricao, qtd, unitario, subtotal, total
    FROM orcamento_itens WHERE orcamento_id = ?
  `;
  const sqlServ = `
    SELECT id, descricao, valor
    FROM orcamento_servicos WHERE orcamento_id = ?
  `;

  db.query(sqlOrc, [id], (e1, r1) => {
    if (e1) return res.status(500).json({ error: e1.sqlMessage || String(e1) });
    if (!r1.length) return res.status(404).json({ error: "Não encontrado" });
    const o = r1[0];
    db.query(sqlItens, [id], (e2, itens = []) => {
      if (e2) return res.status(500).json({ error: e2.sqlMessage || String(e2) });
      db.query(sqlServ, [id], (e3, servicos = []) => {
        if (e3) return res.status(500).json({ error: e3.sqlMessage || String(e3) });
        res.json({
          ...o,
          itens,
          servicos,
        });
      });
    });
  });
});

/* ============================== CRIAR ============================= */
router.post("/", (req, res) => {
  const {
    cliente,
    telefone,
    placa,
    observacoes,
    itens = [],
    mao_obra = [], // = servicos
  } = req.body;

  if (!cliente) return res.status(400).json({ error: "Informe o cliente" });

  const { totItens, totServ, totalGeral } = calcTotais(itens, mao_obra);

  const insOrc = `
    INSERT INTO orcamentos
      (cliente_nome, telefone, placa, observacoes, total_itens, total_servicos, total_geral)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.getConnection((err, conn) => {
    if (err) return res.status(500).json({ error: String(err) });

    conn.beginTransaction((err) => {
      if (err) {
        conn.release();
        return res.status(500).json({ error: String(err) });
      }

      conn.query(
        insOrc,
        [
          cliente,
          telefone || null,
          placa || null,
          observacoes || null,
          totItens,
          totServ,
          totalGeral,
        ],
        (e1, r1) => {
          if (e1) {
            console.error("INSERT orcamentos ERR:", e1);
            return conn.rollback(() => {
              conn.release();
              res.status(500).json({ error: e1.sqlMessage || String(e1) });
            });
          }

          const orcId = r1.insertId;

          const insItens = () => {
            if (!itens.length) return insServ();
            const values = itens.map((it) => {
              const qtd = num(it.qtd || 1);
              const unit = num(it.unitario || 0);
              const subtotal = it.subtotal != null ? num(it.subtotal) : num(qtd * unit);
              const total = it.total != null ? num(it.total) : subtotal; // seu schema tem ambos
              return [orcId, it.descricao || "", qtd, unit, subtotal, total];
            });
            conn.query(
              "INSERT INTO orcamento_itens (orcamento_id, descricao, qtd, unitario, subtotal, total) VALUES ?",
              [values],
              (e2) => {
                if (e2) {
                  console.error("INSERT itens ERR:", e2);
                  return conn.rollback(() => {
                    conn.release();
                    res.status(500).json({ error: e2.sqlMessage || String(e2) });
                  });
                }
                insServ();
              }
            );
          };

          const insServ = () => {
            if (!mao_obra.length) return commitAll();
            const values = mao_obra.map((sv) => [orcId, sv.descricao || "", num(sv.valor || 0)]);
            conn.query(
              "INSERT INTO orcamento_servicos (orcamento_id, descricao, valor) VALUES ?",
              [values],
              (e3) => {
                if (e3) {
                  console.error("INSERT servicos ERR:", e3);
                  return conn.rollback(() => {
                    conn.release();
                    res.status(500).json({ error: e3.sqlMessage || String(e3) });
                  });
                }
                commitAll();
              }
            );
          };

          const commitAll = () =>
            conn.commit((e4) => {
              if (e4) {
                console.error("COMMIT ERR:", e4);
                return conn.rollback(() => {
                  conn.release();
                  res.status(500).json({ error: e4.sqlMessage || String(e4) });
                });
              }
              conn.release();
              res.status(201).json({ id: orcId, cliente, total_geral: totalGeral });
            });

          insItens();
        }
      );
    });
  });
});

/* ============================== ATUALIZAR ============================== */
router.put("/:id", (req, res) => {
  const { id } = req.params;
  const {
    cliente,
    telefone,
    placa,
    observacoes,
    itens = [],
    mao_obra = [],
  } = req.body;

  const { totItens, totServ, totalGeral } = calcTotais(itens, mao_obra);

  db.getConnection((err, conn) => {
    if (err) return res.status(500).json({ error: String(err) });

    conn.beginTransaction((err) => {
      if (err) {
        conn.release();
        return res.status(500).json({ error: String(err) });
      }

      const up = `
        UPDATE orcamentos SET
          cliente_nome = ?, telefone = ?, placa = ?, observacoes = ?,
          total_itens = ?, total_servicos = ?, total_geral = ?
        WHERE id = ?
      `;
      conn.query(
        up,
        [cliente, telefone, placa, observacoes, totItens, totServ, totalGeral, id],
        (e1, r1) => {
          if (e1) {
            console.error("UPDATE orcamentos ERR:", e1);
            return conn.rollback(() => {
              conn.release();
              res.status(500).json({ error: e1.sqlMessage || String(e1) });
            });
          }
          if (r1.affectedRows === 0) {
            conn.release();
            return res.status(404).json({ error: "Não encontrado" });
          }

          conn.query(
            "DELETE FROM orcamento_itens WHERE orcamento_id = ?",
            [id],
            (e2) => {
              if (e2) {
                console.error("DELETE itens ERR:", e2);
                return conn.rollback(() => {
                  conn.release();
                  res.status(500).json({ error: e2.sqlMessage || String(e2) });
                });
              }

              conn.query(
                "DELETE FROM orcamento_servicos WHERE orcamento_id = ?",
                [id],
                (e3) => {
                  if (e3) {
                    console.error("DELETE servicos ERR:", e3);
                    return conn.rollback(() => {
                      conn.release();
                      res.status(500).json({ error: e3.sqlMessage || String(e3) });
                    });
                  }

                  const insItens = () => {
                    if (!itens.length) return insServ();
                    const values = itens.map((it) => {
                      const qtd = num(it.qtd || 1);
                      const unit = num(it.unitario || 0);
                      const subtotal =
                        it.subtotal != null ? num(it.subtotal) : num(qtd * unit);
                      const total = it.total != null ? num(it.total) : subtotal;
                      return [id, it.descricao || "", qtd, unit, subtotal, total];
                    });
                    conn.query(
                      "INSERT INTO orcamento_itens (orcamento_id, descricao, qtd, unitario, subtotal, total) VALUES ?",
                      [values],
                      (e4) => {
                        if (e4) {
                          console.error("RE-INSERT itens ERR:", e4);
                          return conn.rollback(() => {
                            conn.release();
                            res.status(500).json({ error: e4.sqlMessage || String(e4) });
                          });
                        }
                        insServ();
                      }
                    );
                  };

                  const insServ = () => {
                    if (!mao_obra.length) return commitAll();
                    const values = mao_obra.map((sv) => [
                      id,
                      sv.descricao || "",
                      num(sv.valor || 0),
                    ]);
                    conn.query(
                      "INSERT INTO orcamento_servicos (orcamento_id, descricao, valor) VALUES ?",
                      [values],
                      (e5) => {
                        if (e5) {
                          console.error("RE-INSERT servicos ERR:", e5);
                          return conn.rollback(() => {
                            conn.release();
                            res.status(500).json({ error: e5.sqlMessage || String(e5) });
                          });
                        }
                        commitAll();
                      }
                    );
                  };

                  const commitAll = () =>
                    conn.commit((e6) => {
                      if (e6) {
                        console.error("COMMIT update ERR:", e6);
                        return conn.rollback(() => {
                          conn.release();
                          res.status(500).json({ error: e6.sqlMessage || String(e6) });
                        });
                      }
                      conn.release();
                      res.json({ success: true, id: Number(id), total_geral: totalGeral });
                    });

                  insItens();
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
    if (err) return res.status(500).json({ error: err.sqlMessage || String(err) });
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Não encontrado" });
    res.json({ success: true });
  });
});

/* ============================== PDF ============================== */
router.get("/:id/pdf", (req, res) => {
  const { id } = req.params;

  const sqlOrc = `
    SELECT id, cliente_nome AS cliente, telefone, placa, observacoes,
           total_itens, total_servicos, total_geral,
           COALESCE(criado_em, data_criacao) AS data_criacao
    FROM orcamentos WHERE id = ?
  `;
  const sqlItens = `
    SELECT descricao, qtd, unitario, subtotal, total
    FROM orcamento_itens WHERE orcamento_id = ?
  `;
  const sqlServ = `
    SELECT descricao, valor
    FROM orcamento_servicos WHERE orcamento_id = ?
  `;

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

        const hasLogo = fs.existsSync(logoPath);
        if (hasLogo) {
          try {
            doc.image(logoPath, 40, 40, { width: 100 });
          } catch {}
        }
        doc.fontSize(16).text(EMPRESA.nome, hasLogo ? 150 : 40, 40);
        doc.fontSize(10).text(EMPRESA.endereco).text(EMPRESA.telefone).moveDown(0.5);
        doc.fontSize(14).text(`ORÇAMENTO #${o.id}`, { align: "right" }).moveDown(0.5);

        // Cliente / veículo
        doc
          .rect(40, doc.y, 515, 70)
          .stroke()
          .fontSize(11)
          .text(`Cliente: ${o.cliente || "-"}`, 50, doc.y + 10)
          .text(`Telefone: ${o.telefone || "-"}`)
          .text(`Placa: ${o.placa || "-"}`)
          .text(
            `Data: ${
              o.data_criacao
                ? new Date(o.data_criacao).toLocaleString("pt-BR")
                : "-"
            }`
          );

        // Itens
        let y = doc.y + 30;
        doc.fontSize(12).text("Peças / Itens", 40, y);
        doc.moveTo(40, y + 16).lineTo(555, y + 16).stroke();
        y += 22;

        const head = [
          { t: "Qtd", w: 50, a: "right", k: "qtd" },
          { t: "Descrição", w: 320, a: "left", k: "descricao" },
          { t: "Unitário", w: 90, a: "right", k: "unitario", f: brl },
          { t: "Subtotal", w: 90, a: "right", k: "subtotal", f: brl },
        ];

        const drawHeader = (yy) => {
          let x = 40;
          doc.fontSize(10);
          head.forEach((c) => {
            doc.text(c.t, x, yy, { width: c.w, align: c.a });
            x += c.w + 5;
          });
        };
        const drawRow = (row, yy) => {
          let x = 40;
          head.forEach((c) => {
            const v = c.f ? c.f(row[c.k]) : row[c.k];
            doc.text(String(v ?? ""), x, yy, { width: c.w, align: c.a });
            x += c.w + 5;
          });
        };

        drawHeader(y);
        y += 14;
        (itens || []).forEach((it) => {
          if (y > 760) {
            doc.addPage();
            y = 50;
            drawHeader(y);
            y += 14;
          }
          drawRow(it, y);
          y += 14;
        });

        // Serviços
        y += 16;
        if (y > 760) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(12).text("Serviços", 40, y);
        doc.moveTo(40, y + 16).lineTo(555, y + 16).stroke();
        y += 22;

        const headS = [
          { t: "Descrição", w: 410, a: "left", k: "descricao" },
          { t: "Valor", w: 140, a: "right", k: "valor", f: brl },
        ];
        const hS = (yy) => {
          let x = 40;
          doc.fontSize(10);
          headS.forEach((c) => {
            doc.text(c.t, x, yy, { width: c.w, align: c.a });
            x += c.w + 5;
          });
        };
        const rS = (row, yy) => {
          let x = 40;
          headS.forEach((c) => {
            const v = c.f ? c.f(row[c.k]) : row[c.k];
            doc.text(String(v ?? ""), x, yy, { width: c.w, align: c.a });
            x += c.w + 5;
          });
        };

        hS(y);
        y += 14;
        (servicos || []).forEach((sv) => {
          if (y > 760) {
            doc.addPage();
            y = 50;
            hS(y);
            y += 14;
          }
          rS(sv, y);
          y += 14;
        });

        // Totais
        y += 20;
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
          .text(`Peças / Itens: ${brl(o.total_itens)}`, 40, y)
          .text(`Serviços: ${brl(o.total_servicos)}`, 40, y + 16)
          .font("Helvetica-Bold")
          .text(`TOTAL: ${brl(o.total_geral)}`, 400, y + 8, { align: "right" })
          .font("Helvetica");

        // Observações
        y += 48;
        if (o.observacoes) {
          doc.fontSize(11).text("Observações:", 40, y);
          doc.fontSize(10).text(o.observacoes, 40, y + 16, { width: 515 });
        }

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
