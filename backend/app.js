const express = require("express");
const cors = require("cors");

const app = express();

// Middleware
app.use(express.json());

// CORS (libera seu front da Vercel + previews)
app.use(
  cors({
    origin: [
      "https://testeorcc-5srn.vercel.app", // seu domínio de produção
      /\.vercel\.app$/                      // libera domínios de preview da Vercel
    ],
    credentials: true,
  })
);

// Rotas
app.get("/", (req, res) => {
  res.send("API OK ✅");
});

// importa rotas de orçamentos
const orcamentosRoutes = require("../backend/src/routes/orcamentos.js");
app.use("/orcamentos", orcamentosRoutes);

// Start (PORT obrigatória pro Render)
const PORT = process.env.PORT || 5000;
// rota de teste do banco
app.get("/dbcheck", (req, res) => {
  const sql = "SELECT DATABASE() as db, NOW() as agora";
  req.app.get("db").query(sql, (err, rows) => {
    if (err) {
      console.error("❌ Erro no DBCheck:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows[0]);
  });
});
app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta " + PORT);
});
