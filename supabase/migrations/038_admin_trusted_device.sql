-- Modo administrador: mesma regra da verificação em duas etapas do app.
-- Vale a sessão confirmada pelo código (aal2) OU a sessão de um aparelho confiável (30 dias),
-- que só existe depois de o código ter sido digitado naquele aparelho e de a senha estar correta.
create or replace function public.platform_admin_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null or not exists (select 1 from public.platform_admins where user_id = auth.uid()) then 'none'
    when coalesce(auth.jwt() ->> 'aal', '') = 'aal2' then 'ok'
    when exists (
      select 1
        from public.mfa_trusted_sessions s
        join auth.mfa_factors f on f.user_id = s.user_id and f.status = 'verified'
       where s.user_id = auth.uid()
         and s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
         and s.expires_at > now()
    ) then 'ok'
    else 'needs_2fa'
  end;
$$;
