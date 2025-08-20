const express = require("express");
const cors = require("cors");
const db = require("../config/db.js"); // <<< importa a conexão existente

const app = express();
app.use(express.json());
app.use(cors({
  origin: [
    "https://testeorcc-5srn.vercel.app",
    /\.vercel\.app$/
  ],
  credentials: true,
}));

app.get("/", (req, res) => res.send("API OK ✅"));

// suas rotas
const orcamentosRoutes = require("./src/routes/orcamentos.js");
app.use("/orcamentos", orcamentosRoutes);

// >>> ROTA DE TESTE DO BANCO (usa o mesmo db da sua app)
app.get("/dbcheck", (req, res) => {
  db.query("SELECT DATABASE() AS db, NOW() AS agora", (err, rows) => {
    if (err) return res.status(500).json({ error: String(err.message || err) });
    res.json(rows[0]);
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("🚀 Servidor rodando na porta " + PORT));
