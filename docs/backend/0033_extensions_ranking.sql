-- Copyright 2026 Scrakk Studio
-- SPDX-License-Identifier: Apache-2.0
--
-- 0033 — Rating real + ranking del feed de extensiones.
--
-- El rating ya era real (extension_ratings + trigger), pero el feed era sólo
-- rating_avg → downloads y el contador de downloads estaba muerto. Acá:
--   * columnas editoriales (featured / pinned / rank_weight),
--   * flag automático de "destacada" derivado de señales reales,
--   * tabla de eventos para trending con ventana de tiempo,
--   * rating bayesiano (evita que 1 voto de 5 gane a 200 de 4.8),
--   * sort modes (relevance / top / new / trending),
--   * rate-limit para eventos y arreglo del contador de downloads.

-- ── Columnas editoriales ──────────────────────────────────────────────────
alter table public.extensions
  add column if not exists featured boolean not null default false,
  add column if not exists pinned_until timestamptz,
  add column if not exists rank_weight numeric(6,2) not null default 0,
  add column if not exists featured_requested boolean not null default false;

-- Distribución del rating: 5 huecos (1..5 estrellas), lo mantiene el trigger.
alter table public.extensions
  add column if not exists rating_histogram smallint[] not null default '{0,0,0,0,0}';

-- ── Eventos (trending / telemetry ligera) ──────────────────────────────────
create table if not exists public.extension_events (
  id uuid primary key default gen_random_uuid(),
  extension_id uuid not null references public.extensions(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('install','view')),
  created_at timestamptz not null default now()
);
create index if not exists extension_events_ext_time_idx
  on public.extension_events (extension_id, created_at desc);

alter table public.extension_events enable row level security;

-- Los eventos son de lectura pública agregada; el INSERT lo hace sólo el RPC.
drop policy if exists "extension_events public select" on public.extension_events;
create policy "extension_events public select" on public.extension_events
  for select using (true);

-- ── Trigger de rating: promedio + conteo + histograma ─────────────────────
create or replace function public.refresh_extension_rating()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.extensions e
     set rating_avg = coalesce((select round(avg(r.stars)::numeric, 2)
                                  from public.extension_ratings r
                                 where r.extension_id = coalesce(new.extension_id, old.extension_id)), 0),
         rating_count = (select count(*)::int
                           from public.extension_ratings r
                          where r.extension_id = coalesce(new.extension_id, old.extension_id)),
         rating_histogram = coalesce((
           select array[
             (select count(*) from public.extension_ratings r where r.extension_id = coalesce(new.extension_id, old.extension_id) and r.stars = 1),
             (select count(*) from public.extension_ratings r where r.extension_id = coalesce(new.extension_id, old.extension_id) and r.stars = 2),
             (select count(*) from public.extension_ratings r where r.extension_id = coalesce(new.extension_id, old.extension_id) and r.stars = 3),
             (select count(*) from public.extension_ratings r where r.extension_id = coalesce(new.extension_id, old.extension_id) and r.stars = 4),
             (select count(*) from public.extension_ratings r where r.extension_id = coalesce(new.extension_id, old.extension_id) and r.stars = 5)
           ]::smallint[]), '{0,0,0,0,0}'::smallint[])
   where e.id = coalesce(new.extension_id, old.extension_id);
  return coalesce(new, old);
end;
$$;

-- ── Ranking compuesto ─────────────────────────────────────────────────────
-- Rating bayesiano: shrinkage hacia una prior de 4.0 con m=10 votos.
create or replace function public.extension_bayes_rating(
  p_avg numeric, p_count integer
) returns numeric language sql immutable as $$
  select (coalesce(p_avg,0) * coalesce(p_count,0) + 4.0 * 10.0)
         / (coalesce(p_count,0) + 10.0);
$$;

-- "Destacada automáticamente": señales reales, sin intervención del admin.
create or replace function public.extension_is_auto_featured(e public.extensions)
returns boolean language sql stable as $$
  select coalesce(e.rating_count,0) >= 20
     and coalesce(e.rating_avg,0) >= 4.5
     and coalesce(e.downloads,0) >= 100;
$$;

-- Score de tendencia: eventos (install pesa más que view) en los últimos días.
create or replace function public.extension_trend_score(
  p_extension_id uuid, p_days integer default 7
) returns numeric language sql stable as $$
  select coalesce((
    select sum(case when ev.event_type = 'install' then 3.0 else 1.0 end)
      from public.extension_events ev
     where ev.extension_id = p_extension_id
       and ev.created_at > now() - make_interval(days => greatest(1, p_days))
  ), 0);
$$;

-- ── Feed versionado ───────────────────────────────────────────────────────
-- Borrar la firma vieja de 4 args: si quedan DOS sobrecargas, PostgREST no
-- resuelve el rpc() y el catálogo sale vacío (la extensión "no aparece").
drop function if exists public.search_extensions(text, text, integer, integer);
create or replace function public.search_extensions(
  p_query text default null,
  p_category text default null,
  p_limit integer default 40,
  p_offset integer default 0,
  p_sort text default null,      -- relevance | top | new | trending
  p_days integer default 7
)
returns setof public.extensions
language sql stable as $$
  select e.*
  from public.extensions e
  where e.status = 'published'
    and (
      p_query is null or btrim(p_query) = ''
      or e.search_vector @@ websearch_to_tsquery('simple', p_query)
    )
    and (p_category is null or btrim(p_category) = '' or p_category = any (e.categories))
  order by
    -- Boost editorial (manual del admin + automático por señales).
    case
      when e.pinned_until is not null and e.pinned_until > now() then 1000
      when e.featured then 500
      when public.extension_is_auto_featured(e) then 100
      else 0
    end desc,
    coalesce(e.rank_weight, 0) desc,
    case
      when coalesce(p_sort,'') = 'new' then extract(epoch from e.created_at)
      when coalesce(p_sort,'') = 'trending'
        then public.extension_trend_score(e.id, p_days)
      when p_query is not null and btrim(p_query) <> ''
        then ts_rank(e.search_vector, websearch_to_tsquery('simple', p_query)) * 100
      else public.extension_bayes_rating(e.rating_avg, e.rating_count) * 10
           + ln(1 + coalesce(e.downloads,0)) * 2
           + extract(epoch from e.latest_release_at) / 1e9
    end desc,
    e.rating_avg desc,
    e.downloads desc
  limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset);
$$;

-- ── Registro de eventos con rate-limit ────────────────────────────────────
create or replace function public.record_extension_event(
  p_slug text, p_type text default 'view'
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_ext uuid;
  v_recent integer;
begin
  select id into v_ext from public.extensions where slug = p_slug and status = 'published';
  if v_ext is null then return false; end if;
  if p_type not in ('install','view') then return false; end if;

  -- Máximo 20 eventos por extensión/usuario/anónimo en una hora (anti-inflado).
  select count(*) into v_recent
    from public.extension_events ev
   where ev.extension_id = v_ext
     and ev.created_at > now() - interval '1 hour'
     and (ev.user_id = auth.uid() or (ev.user_id is null and auth.uid() is null));
  if v_recent >= 20 then return false; end if;

  insert into public.extension_events (extension_id, user_id, event_type)
  values (v_ext, auth.uid(), p_type);
  return true;
end;
$$;

-- ── Arreglo del contador de downloads (llamado por el SERVIDOR) ───────────
-- El cliente NO puede inflarlo: requiere la clave de servicio del servidor.
create or replace function public.increment_extension_download(p_slug text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.extensions
     set downloads = coalesce(downloads, 0) + 1
   where slug = p_slug and status = 'published';
end;
$$;

-- ── Solicitud de destacada (dueño) ────────────────────────────────────────
create or replace function public.request_extension_featured(p_slug text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_ext uuid;
begin
  select id into v_ext from public.extensions where slug = p_slug and owner = auth.uid();
  if v_ext is null then return false; end if;
  update public.extensions set featured_requested = true where id = v_ext;
  return true;
end;
$$;

-- ── Permisos ──────────────────────────────────────────────────────────────
revoke all on function public.refresh_extension_rating() from public, anon, authenticated;
grant execute on function public.extension_bayes_rating(numeric, integer) to anon, authenticated;
grant execute on function public.extension_is_auto_featured(public.extensions) to anon, authenticated;
grant execute on function public.extension_trend_score(uuid, integer) to anon, authenticated;
grant execute on function public.search_extensions(text, text, integer, integer, text, integer) to anon, authenticated;
grant execute on function public.record_extension_event(text, text) to anon, authenticated;
grant execute on function public.request_extension_featured(text) to authenticated;
-- Sólo el servidor (service_role) puede incrementar downloads.
revoke all on function public.increment_extension_download(text) from public, anon, authenticated;
grant execute on function public.increment_extension_download(text) to service_role;

-- Dueños pueden ver/editar sus propias solicitudes de destacada (ya cubierto
-- por la política de UPDATE de extensions), y todos ven los eventos agregados.
