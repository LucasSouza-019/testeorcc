const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",          // ajuste se tiver senha
  database: "orcamentos_db" // confirme o nome do seu DB
});

db.connect((err) => {
  if (err) {
    console.error("Erro ao conectar no MySQL:", err);
  } else {
    console.log("✅ Conectado ao MySQL");
  }
});

module.exports = db;
