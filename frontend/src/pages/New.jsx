import { useState, useMemo } from "react";
import { createOrcamento } from "../api";
import { useNavigate } from "react-router-dom";

const moeda = (v) => Number(v||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

export default function New(){
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    cliente: "",
    telefone: "",
    descricao: "",
    carro_marca: "",
    carro_modelo: "",
    carro_placa: "",
    carro_ano: "",
    forma_pagamento: ""
  });
  const [itens, setItens] = useState([]);
  const [maoObra, setMaoObra] = useState([]);

  const totais = useMemo(() => {
    const totItens = itens.reduce((s, it) => s + (Number(it.qtd||1) * Number(it.unitario||0)), 0);
    const totMO = maoObra.reduce((s, sv) => s + Number(sv.valor||0), 0);
    return { totItens, totMO, total: Number((totItens + totMO).toFixed(2)) };
  }, [itens, maoObra]);

  const onChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  const addItem = () => setItens(a => [...a, { qtd: 1, descricao: "", unitario: 0 }]);
  const rmItem = (i) => setItens(a => a.filter((_,idx) => idx!==i));
  const chItem = (i, field, val) => setItens(a => a.map((row,idx) => idx===i? { ...row, [field]: val }: row));
  const addMO = () => setMaoObra(a => [...a, { descricao: "", valor: 0 }]);
  const rmMO = (i) => setMaoObra(a => a.filter((_,idx) => idx!==i));
  const chMO = (i, field, val) => setMaoObra(a => a.map((row,idx) => idx===i? { ...row, [field]: val }: row));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      setLoading(true);
      const payload = { ...form, itens, mao_obra: maoObra, valor: (itens.length || maoObra.length) ? undefined : Number(prompt('Valor total (simples):', '0')||0) };
      await createOrcamento(payload);
      nav("/");
    } catch (e){
      console.error(e);
      setError("Erro ao salvar. Confira se o servidor está rodando.");
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={onSubmit}>
      <h2 style={{marginTop:0}}>Novo Orçamento</h2>

      <div className="row">
        <div>
          <label className="label">Cliente</label>
          <input className="input" name="cliente" value={form.cliente} onChange={onChange} placeholder="Nome do cliente" required />
        </div>
        <div>
          <label className="label">Telefone</label>
          <input className="input" name="telefone" value={form.telefone} onChange={onChange} placeholder="(19) 9...." />
        </div>
      </div>

      <div className="row" style={{marginTop:12}}>
        <div>
          <label className="label">Marca</label>
          <input className="input" name="carro_marca" value={form.carro_marca} onChange={onChange} />
        </div>
        <div>
          <label className="label">Modelo</label>
          <input className="input" name="carro_modelo" value={form.carro_modelo} onChange={onChange} />
        </div>
      </div>

      <div className="row" style={{marginTop:12}}>
        <div>
          <label className="label">Placa</label>
          <input className="input" name="carro_placa" value={form.carro_placa} onChange={onChange} />
        </div>
        <div>
          <label className="label">Ano</label>
          <input className="input" name="carro_ano" value={form.carro_ano} onChange={onChange} />
        </div>
      </div>

      <div style={{marginTop:12}}>
        <label className="label">Forma de pagamento</label>
        <input className="input" name="forma_pagamento" value={form.forma_pagamento} onChange={onChange} placeholder="Entrada + parcelas" />
      </div>

      <div style={{marginTop:18}}>
        <label className="label">Itens (Peças)</label>
        {itens.map((it, i) => (
          <div key={i} className="row" style={{marginBottom:8}}>
            <input className="input" placeholder="Qtd" value={it.qtd} onChange={e=>chItem(i,'qtd', e.target.value)} />
            <input className="input" placeholder="Descrição" value={it.descricao} onChange={e=>chItem(i,'descricao', e.target.value)} />
            <input className="input" placeholder="Unitário" type="number" step="0.01" value={it.unitario} onChange={e=>chItem(i,'unitario', e.target.value)} />
            <button type="button" className="btn btn-danger" onClick={()=>rmItem(i)}>Remover</button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" onClick={addItem}>+ Adicionar peça</button>
      </div>

      <div style={{marginTop:18}}>
        <label className="label">Mão de obra</label>
        {maoObra.map((sv, i) => (
          <div key={i} className="row" style={{marginBottom:8}}>
            <input className="input" placeholder="Serviço" value={sv.descricao} onChange={e=>chMO(i,'descricao', e.target.value)} />
            <input className="input" placeholder="Valor" type="number" step="0.01" value={sv.valor} onChange={e=>chMO(i,'valor', e.target.value)} />
            <button type="button" className="btn btn-danger" onClick={()=>rmMO(i)}>Remover</button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" onClick={addMO}>+ Adicionar serviço</button>
      </div>

      <div style={{marginTop:18}}>
        <label className="label">Observações / descrição geral</label>
        <textarea className="textarea" rows={5} name="descricao" value={form.descricao} onChange={onChange} placeholder="Observações gerais, prazos, etc."></textarea>
      </div>

      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:16}}>
        <div className="helper">Subtotal peças: <b>{moeda(totais.totItens)}</b> · Mão de obra: <b>{moeda(totais.totMO)}</b> · Total: <b>{moeda(totais.total)}</b></div>
        <div style={{display:'flex', gap:8}}>
          <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</button>
          <button className="btn btn-ghost" type="button" onClick={() => nav('/')}>Cancelar</button>
        </div>
      </div>
    </form>
  );
}