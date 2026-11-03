-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0035: vuelve a bloquear handles reservados e imitaciones.
-- Proyecto: scrakk-cli (Supabase)
--
-- 0034 quitó la comprobación para que se pudieran crear las cuentas oficiales
-- sin fricción. Ahora que esas cuentas existen y están en handle_allowlist,
-- se restaura la protección: cualquier handle reservado o variante que intente
-- imitar a Scrakk (scrakk, scrakkmarketing, scrakksupport, iamscrakk, …) o a
-- roles (admin, support, root, …) se rechaza salvo para las cuentas oficiales
-- listadas en handle_allowlist.

create or replace function public.validate_handle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare h text := new.handle;
begin
  if h is null or btrim(h) = '' then
    return new;
  end if;
  h := lower(btrim(h));
  if h !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'handle_invalido' using errcode = '23514';
  end if;
  -- Cuentas oficiales: pueden tomar handles reservados o variantes.
  if exists (select 1 from public.handle_allowlist a where a.user_id = new.id) then
    new.handle := h;
    return new;
  end if;
  if public.handle_is_reserved(h) then
    raise exception 'handle_reservado' using errcode = '23514';
  end if;
  new.handle := h;
  return new;
end;
$$;

revoke execute on function public.validate_handle() from anon, authenticated, public;
