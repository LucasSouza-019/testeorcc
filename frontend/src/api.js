import axios from "axios";

export const api = axios.create({
  baseURL: "https://orcamentos-api-ms3w.onrender.com", // << API no Render
});

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
