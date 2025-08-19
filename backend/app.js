const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ping
app.get("/", (req, res) => res.send("API OK"));

// ROTAS (deve existir backend/routes/orcamentos.js)
const orcamentosRoutes = require("./src/routes/orcamentos");
// sem .ts, sem .txt
app.use("/orcamentos", orcamentosRoutes);


app.listen(5000, () => console.log("🚀 Servidor rodando na porta 5000"));
