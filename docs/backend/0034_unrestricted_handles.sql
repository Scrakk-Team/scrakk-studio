-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0034: los handles reservados dejan de bloquear la creación de cuentas.
-- Proyecto: scrakk-cli (Supabase)
--
-- 0008/0009 reservaban palabras como `scrakk`, `admin` o `support` y solo
-- dejaban usarlas a las cuentas de `handle_allowlist`. Eso impide crear las
-- cuentas oficiales del estudio sin una intervención manual por cada una.
--
-- La validación se queda con lo que protege la integridad del dato:
--   * minúsculas + trim
--   * /^[a-z0-9_]{3,24}$/
--   * unicidad por `profiles_handle_lower_key`
--
-- `handle_is_reserved` y `handle_allowlist` se conservan por historial, pero
-- `validate_handle` ya no las consulta.

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
  new.handle := h;
  return new;
end;
$$;

revoke execute on function public.validate_handle() from anon, authenticated, public;
