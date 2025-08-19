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

// CRIAR
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

  db.beginTransaction((err) => {
    if (err) return res.status(500).json({ error: "Falha ao iniciar transação" });

    db.query(
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
          db.rollback(() =>
            res.status(500).json({ error: "Erro ao criar orçamento" })
          );
          return;
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
          db.query(
            "INSERT INTO orcamento_itens (orcamento_id, qtd, descricao, unitario, total) VALUES ?",
            [values],
            (e2) => {
              if (e2)
                return db.rollback(() =>
                  res.status(500).json({ error: "Erro ao salvar itens" })
                );
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
          db.query(
            "INSERT INTO orcamento_servicos (orcamento_id, descricao, valor) VALUES ?",
            [values],
            (e3) => {
              if (e3)
                return db.rollback(() =>
                  res.status(500).json({ error: "Erro ao salvar serviços" })
                );
              commitAll();
            }
          );
        };

        const commitAll = () => {
          db.commit((e4) => {
            if (e4)
              return db.rollback(() =>
                res.status(500).json({ error: "Erro ao finalizar transação" })
              );
            res.json({ id: orcId, cliente, total });
          });
        };

        insertItens();
      }
    );
  });
});

// ATUALIZAR
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

  db.beginTransaction((err) => {
    if (err) return res.status(500).json({ error: "Falha ao iniciar transação" });

    const upOrc = `UPDATE orcamentos SET
      cliente_nome=?, telefone=?, descricao=?, carro_marca=?, carro_modelo=?, carro_placa=?, carro_ano=?, forma_pagamento=?, total=?
      WHERE id = ?`;

    db.query(
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
        if (e1)
          return db.rollback(() =>
            res.status(500).json({ error: "Erro ao atualizar orçamento" })
          );
        if (r1.affectedRows === 0)
          return db.rollback(() =>
            res.status(404).json({ error: "Não encontrado" })
          );

        db.query(
          "DELETE FROM orcamento_itens WHERE orcamento_id = ?",
          [id],
          (e2) => {
            if (e2)
              return db.rollback(() =>
                res.status(500).json({ error: "Erro ao limpar itens" })
              );
            db.query(
              "DELETE FROM orcamento_servicos WHERE orcamento_id = ?",
              [id],
              (e3) => {
                if (e3)
                  return db.rollback(() =>
                    res.status(500).json({ error: "Erro ao limpar serviços" })
                  );

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
                  db.query(
                    "INSERT INTO orcamento_itens (orcamento_id, qtd, descricao, unitario, total) VALUES ?",
                    [values],
                    (e4) => {
                      if (e4)
                        return db.rollback(() =>
                          res.status(500).json({ error: "Erro ao salvar itens" })
                        );
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
                  db.query(
                    "INSERT INTO orcamento_servicos (orcamento_id, descricao, valor) VALUES ?",
                    [values],
                    (e5) => {
                      if (e5)
                        return db.rollback(() =>
                          res.status(500).json({ error: "Erro ao salvar serviços" })
                        );
                      commitAll();
                    }
                  );
                };

                const commitAll = () =>
                  db.commit((e6) => {
                    if (e6)
                      return db.rollback(() =>
                        res
                          .status(500)
                          .json({ error: "Erro ao finalizar transação" })
                      );
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

        /* =================== KNOBS DE LAYOUT =================== */
        const FONT_SCALE = 1.1;
        const ROW_H = 34;
        const LABEL_OFFSET = 14;
        const LINE_GAP = 6;
        const BLOCK_GAP = 12;

        const CONTENT_TOP_Y = 100;
        const NEXT_PAGE_START_Y = 125;

        // PEÇAS mais compactas:
        const ITEM_ROW_H = 18;

        const bottomLimit = () =>
          doc.page.height - doc.page.margins.bottom - 60;

        // === Decoradores / Header / Footer ===
        const drawWatermark = () => {
          try {
            doc.save();
            doc.opacity(0.08);
            const w = 320, h = 320;
            const x = (doc.page.width - w) / 2;
            const y = (doc.page.height - h) / 2;
            doc.image(logoPath, x, y, { fit: [w, h] });
            doc.restore();
          } catch {}
        };

        // Header: “ORÇAMENTO Nº {id}” à direita (fonte menor)
        const drawHeader = (numero) => {
          try { doc.image(logoPath, 40, 30, { fit: [80, 80] }); } catch {}

          // empresa (esquerda)
          doc.fontSize(14 * FONT_SCALE).fillColor("#0f172a")
            .text(EMPRESA.nome, 130, 35, { width: 360 });

          // título + número numa linha (direita)
          doc.fontSize(17 * FONT_SCALE).fillColor("#0f172a")
            .text(`ORÇAMENTO Nº ${numero != null ? String(numero) : ""}`, 0, 35, {
              align: "right",
            });

          // endereço e telefone com respiro
          const rightColW = 220;
          const rightColX = doc.page.width - 40 - rightColW;
          const leftX = 130;
          const gap = 12;
          const leftW = Math.max(120, rightColX - leftX - gap);

          doc.fontSize(10 * FONT_SCALE).fillColor("#374151")
            .text(EMPRESA.endereco, leftX, 55, { width: leftW });

          const TEL_SHIFT = 14;
          doc.text(`Telefone: ${EMPRESA.telefone}`, rightColX, 55 + TEL_SHIFT, {
            width: rightColW, align: "right",
          });

          const lineY = Math.max(90, 55 + TEL_SHIFT + 20);
          doc.moveTo(40, lineY).lineTo(doc.page.width - 40, lineY)
            .strokeColor("#e5e7eb").stroke();

          doc.y = CONTENT_TOP_Y;
        };

        const drawFooter = () => {
          const y = doc.page.height - 40;
          const keep = doc.y;
          doc.fontSize(9 * FONT_SCALE).fillColor("#64748b")
            .text(
              "Orçamento válido por 7 dias. Valores sujeitos à alteração conforme avaliação final.",
              40, y - 18, { width: doc.page.width - 80, align: "center" }
            );
          doc.y = keep;
        };

        const preparePage = (numero) => {
          drawWatermark();
          drawHeader(numero);
          drawFooter();
        };

        preparePage(o.id);
        doc.on("pageAdded", () => {
          preparePage(o.id);
          doc.y = NEXT_PAGE_START_Y;
        });

        // ===== 2 colunas: Cliente / Veículo =====
        // (VEÍCULO / ANO juntos para ganhar espaço)
        const twoCols = (yStart, leftPairs, rightPairs) => {
          const leftX = 40, rightX = 320;
          let y = yStart;

          const drawPairs = (pairs, baseX) => {
            pairs.forEach((p, i) => {
              const yy = y + i * ROW_H;
              doc.fontSize(11 * FONT_SCALE).fillColor("#0f172a").text(p.label, baseX, yy);
              doc.fontSize(10 * FONT_SCALE).fillColor("#1f2937").text(p.value, baseX, yy + LABEL_OFFSET, {
                width: 250, lineGap: LINE_GAP,
              });
            });
          };

          const maxRows = Math.max(leftPairs.length, rightPairs.length);
          const blockH = maxRows * ROW_H + 8;

          if (y + blockH > bottomLimit()) {
            doc.addPage();
            y = NEXT_PAGE_START_Y;
          }
          drawPairs(leftPairs, leftX);
          drawPairs(rightPairs, rightX);

          return y + blockH;
        };

        let y = doc.y;
        y = twoCols(
          y,
          [
            { label: "Cliente", value: o.cliente || "—" },
            { label: "Telefone", value: o.telefone || "—" },
            { label: "Data", value: new Date(o.data_criacao).toLocaleDateString("pt-BR") },
          ],
          [
            { label: "Veículo / Ano", value: `${(o.carro_marca || "—") + " " + (o.carro_modelo || "")} / ${o.carro_ano || "—"}` },
            { label: "Placa", value: o.carro_placa || "—" },
          ]
        );

        doc.y = y + BLOCK_GAP;

        // ===== Forma de pagamento (se houver)
        if (o.forma_pagamento) {
          if (doc.y + 50 > bottomLimit()) doc.addPage();
          doc.fontSize(12 * FONT_SCALE).fillColor("#0f172a").text("Forma de Pagamento", 40, doc.y);
          doc.moveDown(0.2);
          doc.fontSize(10 * FONT_SCALE).fillColor("#1f2937")
            .text(o.forma_pagamento, 40, doc.y, { width: doc.page.width - 80, lineGap: LINE_GAP });
          doc.moveDown(0.8);
        }

        // ===== Peças (colunas ajustadas p/ descrição quebrar depois) =====
        const drawItensHeader = () => {
          const startY = doc.y;

          // ---- ajustes que dão mais espaço para a descrição ----
          const COL_GAP = 10;     // gap entre Unitário e Total
          const COL_TOTAL_W = 90; // antes 100
          const COL_UNIT_W  = 90; // antes 110
          // ------------------------------------------------------

          // TOTAL encostado na direita
          const COL_TOTAL_X = doc.page.width - 40 - COL_TOTAL_W;
          // UNITÁRIO à esquerda de TOTAL, com gap
          const COL_UNIT_X  = COL_TOTAL_X - COL_GAP - COL_UNIT_W;

          // cabeçalho
          doc.rect(40, startY, doc.page.width - 80, 24).fill("#f1f5f9");
          doc.fillColor("#0f172a").fontSize(10 * FONT_SCALE)
            .text("Qtd", 48, startY + 7)
            .text("Descrição", 100, startY + 7)
            .text("Unitário", COL_UNIT_X, startY + 7, { width: COL_UNIT_W, align: "right" })
            .text("Total", COL_TOTAL_X, startY + 7, { width: COL_TOTAL_W, align: "right" });
          doc.fillColor("#111");

          return {
            nextY: startY + 28,
            COL_UNIT_X,
            COL_UNIT_W,
            COL_TOTAL_X,
            COL_TOTAL_W,
          };
        };

        if (itens && itens.length > 0) {
          if (doc.y + 60 > bottomLimit()) doc.addPage();
          doc.fontSize(12 * FONT_SCALE).fillColor("#0f172a").text("Peças", 40, doc.y);
          doc.moveDown(0.3);

          let {
            nextY: yRow,
            COL_UNIT_X,
            COL_UNIT_W,
            COL_TOTAL_X,
            COL_TOTAL_W,
          } = drawItensHeader();

          for (const it of itens) {
            // Descrição pode ir mais à direita antes de quebrar
            const DESC_GAP = 6; // espaço entre Descrição e coluna Unitário
            const descWidth = COL_UNIT_X - (100 + DESC_GAP); // 100 é o X do título "Descrição"
            const descOptions = { width: descWidth, lineGap: Math.max(2, LINE_GAP - 2) };

            doc.fontSize(10 * FONT_SCALE);
            const descHeight = doc.heightOfString(it.descricao || "—", descOptions);

            const rowHeight = Math.max(ITEM_ROW_H, Math.ceil(descHeight) + 4);

            if (yRow + rowHeight > bottomLimit()) {
              doc.addPage();
              doc.fontSize(12 * FONT_SCALE).fillColor("#0f172a").text("Peças", 40, doc.y);
              doc.moveDown(0.3);
              ({
                nextY: yRow,
                COL_UNIT_X,
                COL_UNIT_W,
                COL_TOTAL_X,
                COL_TOTAL_W,
              } = drawItensHeader());
            }

            doc.fontSize(10 * FONT_SCALE)
              .text(String(it.qtd || 1), 48, yRow)
              .text(it.descricao || "—", 100, yRow, { width: descWidth, lineGap: Math.max(2, LINE_GAP - 2) });

            doc.text(brl(it.unitario || 0), COL_UNIT_X, yRow, {
              width: COL_UNIT_W, align: "right", lineBreak: false,
            });
            doc.text(
              brl(it.total || Number(it.qtd || 1) * Number(it.unitario || 0)),
              COL_TOTAL_X, yRow, { width: COL_TOTAL_W, align: "right", lineBreak: false }
            );

            // linha no fim da linha (funciona bem com multi-linha)
            const quebrou = Math.ceil(descHeight) + 4 > ITEM_ROW_H;
            const lineOffset = quebrou ? 2 : 6; // ajuste fino
            const lineY = yRow + rowHeight - lineOffset;
            doc.moveTo(40, lineY).lineTo(doc.page.width - 40, lineY)
              .strokeColor("#e5e7eb").lineWidth(0.8).stroke();

            yRow += rowHeight;
          }
          doc.y = yRow + 8;
        }

        // ===== Mão de Obra =====
        const drawServHeader = () => {
          const startY = doc.y;
          doc.rect(40, startY, doc.page.width - 80, 24).fill("#f1f5f9");
          doc.fillColor("#0f172a").fontSize(10 * FONT_SCALE)
            .text("Descrição", 48, startY + 7)
            .text("Valor", doc.page.width - 120, startY + 7, { width: 80, align: "right" });
          doc.fillColor("#111");
          return startY + 28;
        };

        if (servicos && servicos.length > 0) {
          if (doc.y + 60 > bottomLimit()) doc.addPage();
          doc.fontSize(12 * FONT_SCALE).fillColor("#0f172a").text("Mão de Obra", 40, doc.y);
          doc.moveDown(0.3);
          let yRow2 = drawServHeader();

          for (const sv of servicos) {
            if (yRow2 + 20 > bottomLimit()) {
              doc.addPage();
              doc.fontSize(12 * FONT_SCALE).fillColor("#0f172a").text("Mão de Obra", 40, doc.y);
              doc.moveDown(0.3);
              yRow2 = drawServHeader();
            }
            doc.fontSize(10 * FONT_SCALE)
              .text(sv.descricao || "—", 48, yRow2, { width: doc.page.width - 180, lineGap: LINE_GAP })
              .text(brl(sv.valor || 0), doc.page.width - 120, yRow2, { width: 80, align: "right" });
            yRow2 += 20;
          }
          doc.y = yRow2 + 12;
        }

        // ===== Observações + TOTAL (lado a lado) — TOTAL menor =====
        const hasObs = o.descricao && String(o.descricao).trim() !== "";

        const totalBoxW = 170;   // largura do card TOTAL (era 220)
        const totalBoxH = 64;    // altura do card TOTAL (era 78)

        const gap = 20;
        const obsX = 40;
        const obsW = doc.page.width - 80 - totalBoxW - gap;
        const totalX = doc.page.width - 40 - totalBoxW;

        let blockTopY = doc.y;
        if (hasObs) {
          doc.fontSize(12 * FONT_SCALE).fillColor("#0f172a").text("Observações / Descrição", obsX, blockTopY);
          doc.moveDown(0.2);
          doc.fontSize(10 * FONT_SCALE).fillColor("#111")
            .text(String(o.descricao), obsX, doc.y, { width: obsW, lineGap: LINE_GAP });
        }

        const totalBoxY = blockTopY;
        doc.roundedRect(totalX, totalBoxY, totalBoxW, totalBoxH, 6)
          .strokeColor("#e5e7eb").lineWidth(1).stroke();

        doc.fontSize(11 * FONT_SCALE).fillColor("#0f172a")
          .text("TOTAL", totalX + 12, totalBoxY + 8);

        doc.fontSize(16 * FONT_SCALE).fillColor("#16a34a")
          .text(brl(o.total || 0), totalX + 12, totalBoxY + totalBoxH - 28, {
            width: totalBoxW - 24, align: "right",
          });

        const afterObsY = hasObs ? doc.y : blockTopY;
        const baseY = Math.max(afterObsY, totalBoxY + totalBoxH);

        /* ===== Assinaturas (ancoradas no rodapé) ===== */
        {
          const SIG_H = 48;                   // altura da área de assinatura
          const FOOTER_BASE_Y = doc.page.height - 40; // mesmo Y do drawFooter()
          const FOOTER_TEXT_TOP = FOOTER_BASE_Y - 18; // topo do texto do rodapé
          const ABOVE_FOOTER = 24;            // ↑ maior = sobe / ↓ menor = desce

          let sigY = FOOTER_TEXT_TOP - ABOVE_FOOTER;

          // se não couber nesta página (colidir com baseY), vai p/ próxima
          if (sigY - 12 < baseY) {
            doc.addPage();
            const FB = doc.page.height - 40;
            const FT = FB - 18;
            sigY = FT - ABOVE_FOOTER;
          }

          const leftX = 40;
          const rightX = doc.page.width / 2 + 20;
          const lineW = doc.page.width / 2 - 60;

          doc.moveTo(leftX, sigY).lineTo(leftX + lineW, sigY)
            .strokeColor("#0f172a").lineWidth(1).stroke();
          doc.moveTo(rightX, sigY).lineTo(rightX + lineW, sigY)
            .strokeColor("#0f172a").lineWidth(1).stroke();

          doc.fontSize(9 * FONT_SCALE).fillColor("#64748b")
            .text("Assinatura (Oficina)", leftX, sigY - 12, { width: lineW, align: "center" })
            .text("Assinatura (Cliente)", rightX, sigY - 12, { width: lineW, align: "center" });

          doc.fontSize(10 * FONT_SCALE).fillColor("#1f2937")
            .text(EMPRESA.nome, leftX, sigY + 6, { width: lineW, align: "center" })
            .text(o.cliente || "Cliente", rightX, sigY + 6, { width: lineW, align: "center" });

          doc.y = sigY + 36;
        }

        doc.end();
      });
    });
  });
});

module.exports = router;