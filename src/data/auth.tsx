import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

interface AuthValue {
  session: Session | null;
  /** null while loading or when the user belongs to no household. */
  householdId: string | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

async function householdOf(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('household_members').select('household_id').eq('user_id', userId).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.household_id ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const userId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    // Resolves the household only when the signed-in user changes (supabase-js also emits
    // SIGNED_IN on token recovery / tab focus, which must not reset the app).
    function apply(s: Session | null) {
      setSession(s);
      const uid = s?.user.id ?? null;
      if (uid === userId.current) return;
      userId.current = uid;
      setLoading(true);
      queryClient.clear();
      // Deferred: supabase-js forbids awaiting its own calls inside the auth callback.
      setTimeout(async () => {
        const hid = uid ? await householdOf(uid).catch(() => null) : null;
        if (!active || userId.current !== uid) return;
        setHouseholdId(hid);
        setLoading(false);
      }, 0);
    }
    const { data } = supabase.auth.onAuthStateChange((_event, s) => apply(s));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const value: AuthValue = {
    session,
    householdId,
    loading,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signOut() {
      await supabase.auth.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return ctx;
}

/** The signed-in user's household. Only valid inside <RequireAuth>. */
export function useHouseholdId(): string {
  const { householdId } = useAuth();
  if (!householdId) throw new Error('useHouseholdId usado fora de <RequireAuth>.');
  return householdId;
}

const Centered = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-screen items-center justify-center p-8">{children}</div>
);

/** Route guard: renders the child routes only for a signed-in member of a household. */
export function RequireAuth() {
  const { session, householdId, loading, signOut } = useAuth();
  if (loading) return <Centered><p className="text-muted">Carregando…</p></Centered>;
  if (!session) return <Navigate to="/login" replace />;
  if (!householdId) {
    return (
      <Centered>
        <div className="max-w-md rounded-card border border-line bg-card p-6 text-center">
          <p className="mb-4">Sua conta não está ligada a nenhuma casa. Execute o seed (veja docs/setup-guide.md).</p>
          <button className="font-semibold text-accent" onClick={() => signOut()}>Sair</button>
        </div>
      </Centered>
    );
  }
  return <Outlet />;
}

export function LoginPage() {
  const { session, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      navigate('/', { replace: true });
    } catch {
      setError('E-mail ou senha incorretos.');
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full rounded-inner border border-line bg-card px-3 py-2 outline-none focus:border-accent';
  return (
    <Centered>
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-line bg-card p-8">
        <div>
          <h1 className="text-2xl font-extrabold">Orçamento da Casa</h1>
          <p className="text-sm text-muted">Thiago &amp; Laina</p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          E-mail
          <input className={input} type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Senha
          <input className={input} type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm font-semibold text-warn">{error}</p>}
        <button type="submit" disabled={busy}
          className="rounded-inner bg-accent px-4 py-2 font-bold text-white disabled:opacity-60">
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </Centered>
  );
}
