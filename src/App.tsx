import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './ui/Layout';
import IncomesPage from './features/incomes/IncomesPage';
import { AuthProvider, LoginPage, RequireAuth } from './data/auth';

const Placeholder = ({ title }: { title: string }) => (
  <h1 className="text-2xl font-extrabold">{title}</h1>
);

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<Placeholder title="Painel" />} />
              <Route path="mes-a-mes" element={<Placeholder title="Mês a mês" />} />
              <Route path="receitas" element={<IncomesPage />} />
              <Route path="despesas" element={<Placeholder title="Despesas" />} />
              <Route path="cartoes" element={<Placeholder title="Cartões" />} />
            </Route>
          </Route>
          <Route path="login" element={<LoginPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
