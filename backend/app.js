const express = require("express");
const cors = require("cors");
const db = require("./src/config/db.js"); // importa a conexão (mesmo db das suas rotas)

const app = express();

// middlewares
app.use(express.json());
app.use(
  cors({
    origin: [
      "https://testeorcc-5srn.vercel.app",
      /\.vercel\.app$/
    ],
    credentials: true,
  })
);

// rota raiz (ping)
app.get("/", (req, res) => {
  res.send("API OK ✅");
});

// rotas de orçamentos
const orcamentosRoutes = require("./src/routes/orcamentos.js");
app.use("/orcamentos", orcamentosRoutes);

// rota de teste do banco (opcional, mas útil)
app.get("/dbcheck", (req, res) => {
  db.query("SELECT DATABASE() AS db, NOW() AS agora", (err, rows) => {
    if (err) return res.status(500).json({ error: String(err.message || err) });
    res.json(rows[0]);
  });
});

// start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta " + PORT);
});
