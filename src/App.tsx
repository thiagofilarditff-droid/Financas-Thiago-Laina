import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './ui/Layout';
import IncomesPage from './features/incomes/IncomesPage';
import ExpensesPage from './features/expenses/ExpensesPage';
import CardsPage from './features/cards/CardsPage';
import GridPage from './features/grid/GridPage';
import DashboardPage from './features/dashboard/DashboardPage';
import { AuthProvider, LoginPage, RequireAuth } from './data/auth';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="mes-a-mes" element={<GridPage />} />
              <Route path="receitas" element={<IncomesPage />} />
              <Route path="despesas" element={<ExpensesPage />} />
              <Route path="cartoes" element={<CardsPage />} />
            </Route>
          </Route>
          <Route path="login" element={<LoginPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
