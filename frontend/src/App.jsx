import { NavLink, Route, Routes } from "react-router-dom";
import List from "./pages/List.jsx";
import New from "./pages/New.jsx";
import Edit from "./pages/Edit.jsx";

function Topbar(){
  return (
    <div className="topbar">
      <div className="brand">⚙️ Orçamentos • Funilaria</div>
      <div className="nav">
        <NavLink to="/" end>Lista</NavLink>
        <NavLink to="/novo">Novo</NavLink>
      </div>
    </div>
  );
}

export default function App(){
  return (
    <div className="container">
      <Topbar />
      <div className="card">
        <Routes>
          <Route path="/" element={<List />} />
          <Route path="/novo" element={<New />} />
          <Route path="/editar/:id" element={<Edit />} />
        </Routes>
      </div>
    </div>
  );
}