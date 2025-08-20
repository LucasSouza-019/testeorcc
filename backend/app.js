const express = require("express");
const cors = require("cors");
const db = require("./src/config/db"); // importa conexão

const app = express();
app.set("db", db); // guarda no app

// Middleware
app.use(express.json());

// CORS
app.use(
  cors({
    origin: [
      "https://testeorcc-5srn.vercel.app",
      /\.vercel\.app$/
    ],
    credentials: true,
  })
);

// Rotas
app.get("/", (req, res) => {
  res.send("API OK ✅");
});

const orcamentosRoutes = require("./src/routes/orcamentos.js");
app.use("/orcamentos", orcamentosRoutes);

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

// Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta " + PORT);
});
