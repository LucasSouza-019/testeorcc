const express = require("express");
const router = express.Router();
const path = require("path");
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

// CRIAR (com transação via conexão do pool)
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

  // >>>> pega uma conexão do pool
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
              Number(it.qtd || 1),
              it.descricao || "",
              Number(it.unitario || 0),
              Number((Number(it.qtd || 1) * Number(it.unitario || 0)).toFixed(2)),
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
              Number(sv.valor || 0),
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

// ATUALIZAR (com transação via conexão do pool)
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
                      Number(it.qtd || 1),
                      it.descricao || "",
                      Number(it.unitario || 0),
                      Number(
                        (Number(it.qtd || 1) * Number(it.unitario || 0)).toFixed(2)
                      ),
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
                      Number(sv.valor || 0),
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

                  insertItens();
                }
              );
            }
          );
        }
      );
    });
  });
});

// EXCLUIR
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

        /* ======= (restante do seu código de PDF permanece igual) ======= */
        // ... (mantive o mesmo conteúdo do seu arquivo original)
        // Para encurtar aqui, não alterei a lógica do PDF.
        // ===> Cole aqui exatamente o mesmo bloco do PDF do seu arquivo atual <===
        // (todo o trecho entre "/* ============================== PDF AVANÇADO ============================= */"
        //  até "doc.end();", que você já tinha.)
        // ----------------------------------------------------------------------

        // IMPORTANTE: não esqueça de finalizar o doc no fim do seu bloco:
        // doc.end();
      });
    });
  });
});

module.exports = router;
