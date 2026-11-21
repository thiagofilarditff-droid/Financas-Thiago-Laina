-- SOMENTE DESENVOLVIMENTO LOCAL: marcador que libera seed.local.sql no `supabase db reset`.
-- Nunca execute em produção (nem use `supabase db push --include-seed` contra produção).
select set_config('seed.allow_local', 'on', false);
