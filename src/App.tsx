import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './ui/Layout';

const Placeholder = ({ title }: { title: string }) => (
  <h1 className="text-2xl font-extrabold">{title}</h1>
);

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Placeholder title="Painel" />} />
          <Route path="mes-a-mes" element={<Placeholder title="Mês a mês" />} />
          <Route path="receitas" element={<Placeholder title="Receitas e contracheques" />} />
          <Route path="despesas" element={<Placeholder title="Despesas" />} />
          <Route path="cartoes" element={<Placeholder title="Cartões" />} />
        </Route>
        <Route path="login" element={<Placeholder title="Entrar" />} />
      </Routes>
    </BrowserRouter>
  );
}
