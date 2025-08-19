import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { listOrcamentos, downloadPDF, deleteOrcamento } from "../api";

export default function List(){
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  const load = async (query = "") => {
    try {
      setLoading(true);
      const res = await listOrcamentos(query);
      setData(res.data || []);
    } catch (e){
      console.error(e);
      setError("Falha ao carregar orçamentos.");
    } finally { setLoading(false); }
  };

  const onSearchChange = async (e) => {
    const value = e.target.value;
    setQ(value);
    await load(value);
  };

  const onSearchSubmit = async (e) => {
    e.preventDefault();
    await load(q);
  };

  useEffect(() => { load(); }, []);

  const onDelete = async (id) => {
    if (!confirm(`Deseja excluir o orçamento #${id}?`)) return;
    try {
      await deleteOrcamento(id);
      await load();
    } catch (e){
      console.error(e);
      alert("Erro ao excluir. Veja o console.");
    }
  };

  if (loading) return <div className="helper">Carregando...</div>;
  if (error) return <div className="helper">{error}</div>;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <h2 style={{margin:0}}>Orçamentos</h2>
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <form onSubmit={onSearchSubmit} style={{display:"flex", gap:8}}>
            <input
              type="text"
              placeholder="Buscar..."
              value={q}
              onChange={onSearchChange}
            />
            <button className="btn btn-ghost" type="submit">Buscar</button>
          </form>
          <button className="btn btn-ghost" onClick={() => load()}>Recarregar</button>
        </div>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Cliente</th>
            <th>Descrição</th>
            <th>Valor</th>
            <th>Criado em</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 && (
            <tr>
              <td colSpan="6" className="helper">Nenhum orçamento cadastrado ainda.</td>
            </tr>
          )}
          {data.map((item) => (
            <tr key={item.id}>
              <td>#{item.id}</td>
              <td>{item.cliente || item.cliente_nome || "—"}</td>
              <td style={{maxWidth:360}}>{item.descricao}</td>
              <td><span className="badge">R$ {Number(item.valor).toFixed(2)}</span></td>
              <td>{item.data_criacao ? dayjs(item.data_criacao).format("DD/MM/YYYY") : "—"}</td>
              <td>
                <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                  <button className="btn btn-ghost" onClick={() => window.location.href = `/editar/${item.id}`}>Editar</button>
                  <button className="btn btn-danger" onClick={() => onDelete(item.id)}>Excluir</button>
                  <button className="btn btn-primary" onClick={() => downloadPDF(item.id)}>PDF</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}