-- =====================================================================
-- 023: perfil do negócio (entrevista de cadastro).
--
-- Guarda no workspace como a empresa é: tipo (MEI, ME...), se tem equipe e
-- de que tamanho, e o ramo. Serve para adaptar o sistema e, mais adiante,
-- sugerir e limitar planos. `onboarded_at` marca que a entrevista já foi
-- respondida; quem já usava o sistema antes dela não é entrevistado.
-- =====================================================================

alter table public.workspaces
  add column if not exists business_type text check (business_type in ('mei', 'me', 'epp', 'outra_pj', 'pf')),
  add column if not exists team_size text check (team_size in ('solo', '2-5', '6-15', '16+')),
  add column if not exists segment text check (segment is null or length(segment) <= 80),
  add column if not exists onboarded_at timestamptz;

-- quem já existe não precisa responder
update public.workspaces set onboarded_at = coalesce(onboarded_at, now()) where onboarded_at is null;

grant update (business_type, team_size, segment, onboarded_at) on public.workspaces to authenticated;

notify pgrst, 'reload schema';
