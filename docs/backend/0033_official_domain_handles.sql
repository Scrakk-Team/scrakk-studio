-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0033: las cuentas del dominio oficial pueden usar handles reservados.
-- Proyecto: scrakk-cli (Supabase)
--
-- Nota: 0034 deja de consultar la allowlist al validar handles. Esta migración
-- se conserva como historial y para dejar registradas las cuentas oficiales
-- que ya existían.
--
-- 0009 dejó la allowlist como una lista manual. Eso obliga a agregar cada
-- cuenta oficial a mano y, si se borra y se vuelve a crear (founder@scrakk.art),
-- la fila desaparece por la cascada de auth.users y el handle vuelve a quedar
-- bloqueado.
--
-- La allowlist sigue existiendo para cuentas externas autorizadas, pero toda
-- cuenta creada con un email @scrakk.art entra automáticamente: el dominio es
-- del estudio y el OTP ya confirma la propiedad del buzón.

create or replace function public.ensure_profile()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;

  if lower(split_part(coalesce(new.email, ''), '@', 2)) = 'scrakk.art' then
    insert into public.handle_allowlist (user_id, note)
    values (new.id, 'cuenta oficial Scrakk')
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

revoke execute on function public.ensure_profile() from anon, authenticated, public;

-- Backfill: cuentas @scrakk.art que ya existían antes de esta migración.
insert into public.handle_allowlist (user_id, note)
select u.id, 'cuenta oficial Scrakk'
from auth.users u
where lower(split_part(coalesce(u.email, ''), '@', 2)) = 'scrakk.art'
on conflict (user_id) do nothing;
