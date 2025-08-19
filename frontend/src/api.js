import axios from "axios";

const BASE_URL =
  import.meta.env.VITE_API_BASE || window.__API_BASE__ || "/";

export const api = axios.create({ baseURL: BASE_URL });

export const listOrcamentos = (q) =>
  api.get("/orcamentos", { params: { q } });
export const createOrcamento = (payload) => api.post("/orcamentos", payload);
export const getOrcamento = (id) => api.get(`/orcamentos/${id}`);
export const updateOrcamento = (id, payload) => api.put(`/orcamentos/${id}`, payload);
export const deleteOrcamento = (id) => api.delete(`/orcamentos/${id}`);

export const downloadPDF = async (id) => {
  const response = await api.get(`/orcamentos/${id}/pdf`, { responseType: "blob" });
  const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `orcamento_${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
};
