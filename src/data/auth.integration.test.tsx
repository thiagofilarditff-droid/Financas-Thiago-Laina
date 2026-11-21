// Runs against the local Supabase stack, via `npm run test:integration`.
// Replaces the manual browser check: log in as the seeded local user and load the snapshot.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

describe.skipIf(!process.env.LOCAL_SUPABASE)('login against the local stack', () => {
  async function renderApp() {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', ANON);
    const { AuthProvider, LoginPage, RequireAuth } = await import('./auth');
    const { useSnapshot } = await import('./snapshot');
    const { supabase } = await import('./supabase');
    await supabase.auth.signOut();
    function Probe() {
      const { data } = useSnapshot();
      return <p>{data ? `${data.expenses.length} despesas` : 'carregando'}</p>;
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <Routes>
              <Route element={<RequireAuth />}><Route index element={<Probe />} /></Route>
              <Route path="login" element={<LoginPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  async function logIn(password: string) {
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('E-mail'), 'thiago@local.test');
    await user.type(screen.getByLabelText('Senha'), password);
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
  }

  test('wrong password shows the Portuguese error', async () => {
    await renderApp();
    await logIn('errada');
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
  });

  test('seeded user logs in and sees a snapshot with 11 expenses', async () => {
    await renderApp();
    await logIn('senha-local-123');
    expect(await screen.findByText('11 despesas', {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
