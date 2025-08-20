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
app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta " + PORT);
});
