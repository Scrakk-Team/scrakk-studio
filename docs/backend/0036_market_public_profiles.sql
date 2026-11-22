-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
-- Licencia completa en LICENSE (Apache License 2.0).

-- 0036: el listado de valoraciones (y el autor de cada extensión) mostraba
-- "?" y "—" porque `anon` NO puede SELECT en `profiles`:
--   - los grants de columna son sólo para `authenticated` (0030), y
--   - las policies de SELECT son `auth.uid() = id` (sólo el propio perfil).
--
-- No queremos aflojar RLS en `profiles` (expondría email y datos privados).
-- En su lugar, un view con SOLO los campos públicos que ya se muestran en el
-- social (nombre, handle, foto y verificación). El view lo ejecuta su owner
-- (postgres), así que ve todas las filas; `security_barrier` evita filtrar
-- condiciones a través de él.

create or replace view public.market_public_profiles
with (security_barrier = true) as
select
  id,
  display_name,
  handle,
  avatar_url,
  verified
from public.profiles;

grant select on public.market_public_profiles to anon, authenticated;
