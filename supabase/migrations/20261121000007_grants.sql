-- Hosted Supabase projects may not grant table access to logged-in users by default.
-- Row Level Security (every table has it enabled) still limits each user to their own household.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
