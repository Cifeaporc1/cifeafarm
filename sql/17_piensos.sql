-- =====================================================================
-- CIFEAFARM · Control de piensos (porcino y rumiantes)
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible:
-- se puede ejecutar varias veces y no borra ningún dato.
--
-- 1. Silos (o comederos, tolvas…) de cada granja y a qué zonas dan de comer.
-- 2. Fichas de pienso: composición, análisis, fabricante, si es medicado.
-- 3. Reposiciones: qué pienso, en qué silo, cuántos kg y qué día.
-- 4. Problemas digestivos (diarreas, comen menos, rechazo…) para
--    compararlos con los cambios de pienso y con el consumo.
-- El profesorado gestiona silos y fichas; todos anotan reposiciones y problemas.
-- =====================================================================

-- ---------- 1. Silos
create table if not exists public.silos (
  id           uuid primary key default gen_random_uuid(),
  granja       text not null check (granja in ('rumi', 'porc')),
  nombre       text not null,
  capacidad_kg numeric,
  zonas        text[] not null default '{}',   -- zonas a las que da de comer
  notas        text,
  activo       boolean not null default true,
  orden        smallint not null default 0,
  creado       timestamptz not null default now(),
  unique (granja, nombre)
);
insert into public.silos (granja, nombre, zonas, orden) values
  ('porc', 'Silo madres', array['Parques de vacías', 'Parque erótico', 'Sala de implantación', 'Parques de gestación', 'Salas de partos'], 1),
  ('porc', 'Silo transición', array['Lechoneras'], 2),
  ('porc', 'Silo cebo', array['Cebadero'], 3)
on conflict (granja, nombre) do nothing;

-- ---------- 2. Piensos
create table if not exists public.piensos (
  id           uuid primary key default gen_random_uuid(),
  granja       text not null default 'porc' check (granja in ('rumi', 'porc', 'ambas')),
  nombre       text not null,
  tipo         text,                 -- gestación, lactación, transición, cebo, cabritos…
  fabricante   text,
  composicion  text,                 -- ingredientes tal como vienen en la etiqueta
  proteina     numeric,              -- % proteína bruta
  grasa        numeric,              -- % grasa bruta
  fibra        numeric,              -- % fibra bruta
  cenizas      numeric,              -- % cenizas
  energia      text,                 -- p. ej. 2.300 kcal EN/kg
  medicado     boolean not null default false,
  aditivos     text,                 -- aditivos o medicamento del pienso medicado
  notas        text,
  activo       boolean not null default true,
  creado       timestamptz not null default now(),
  modificado   timestamptz not null default now()
);

-- ---------- 3. Reposiciones
create table if not exists public.pienso_reposiciones (
  id          uuid primary key default gen_random_uuid(),
  granja      text not null check (granja in ('rumi', 'porc')),
  silo_id     uuid references public.silos(id) on delete set null,
  pienso_id   uuid references public.piensos(id) on delete restrict,
  fecha       date not null,
  kg          numeric not null check (kg > 0),
  resto_kg    numeric check (resto_kg >= 0),  -- lo que quedaba en el silo antes de llenar (aprox.)
  lote        text,
  albaran     text,
  nota        text,
  autor       uuid references auth.users(id) on delete set null,
  autor_alias text,
  curso       smallint,
  creado      timestamptz not null default now()
);
create index if not exists pienso_repos_silo on public.pienso_reposiciones (silo_id, fecha);

-- ---------- 4. Problemas digestivos y de consumo
create table if not exists public.pienso_incidencias (
  id          uuid primary key default gen_random_uuid(),
  granja      text not null check (granja in ('rumi', 'porc')),
  fecha       date not null,
  tipo        text not null check (tipo in ('diarrea', 'baja_ingesta', 'rechazo', 'vomitos', 'estrenimiento', 'timpanismo', 'otra')),
  zona        text,
  silo_id     uuid references public.silos(id) on delete set null,
  animales    integer check (animales >= 0),
  nota        text,
  autor       uuid references auth.users(id) on delete set null,
  autor_alias text,
  curso       smallint,
  creado      timestamptz not null default now()
);
create index if not exists pienso_inc_fecha on public.pienso_incidencias (granja, fecha);

-- ---------- Autoría (quién y cuándo) en reposiciones e incidencias
create or replace function public.piensos_autoria() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.autor := auth.uid(); new.creado := now();
  select alias, granja_id into new.autor_alias, new.curso from perfiles where user_id = auth.uid();
  return new;
end $$;
drop trigger if exists pienso_reposiciones_autoria on public.pienso_reposiciones;
create trigger pienso_reposiciones_autoria before insert on public.pienso_reposiciones for each row execute function public.piensos_autoria();
drop trigger if exists pienso_incidencias_autoria on public.pienso_incidencias;
create trigger pienso_incidencias_autoria before insert on public.pienso_incidencias for each row execute function public.piensos_autoria();

create or replace function public.piensos_modificado() returns trigger
language plpgsql as $$ begin new.modificado := now(); return new; end $$;
drop trigger if exists piensos_modificado on public.piensos;
create trigger piensos_modificado before update on public.piensos for each row execute function public.piensos_modificado();

-- ---------- Permisos
alter table public.silos enable row level security;
alter table public.piensos enable row level security;
alter table public.pienso_reposiciones enable row level security;
alter table public.pienso_incidencias enable row level security;
do $$
declare t text;
begin
  foreach t in array array['silos', 'piensos', 'pienso_reposiciones', 'pienso_incidencias'] loop
    execute format('drop policy if exists %1$s_ver on public.%1$s', t);
    execute format('drop policy if exists %1$s_alta on public.%1$s', t);
    execute format('drop policy if exists %1$s_cambio on public.%1$s', t);
    execute format('drop policy if exists %1$s_borrado on public.%1$s', t);
    execute format('create policy %1$s_ver on public.%1$s for select to authenticated using (public.tiene_acceso())', t);
  end loop;
end $$;
-- Silos y fichas de pienso: el profesorado
create policy silos_alta on public.silos for insert to authenticated with check (public.es_profesor());
create policy silos_cambio on public.silos for update to authenticated using (public.es_profesor()) with check (public.es_profesor());
create policy silos_borrado on public.silos for delete to authenticated using (public.es_admin());
create policy piensos_alta on public.piensos for insert to authenticated with check (public.es_profesor());
create policy piensos_cambio on public.piensos for update to authenticated using (public.es_profesor()) with check (public.es_profesor());
create policy piensos_borrado on public.piensos for delete to authenticated using (public.es_admin());
-- Reposiciones y problemas: todos anotan; corrige el profesorado o quien lo anotó en las 24 h siguientes
create policy pienso_reposiciones_alta on public.pienso_reposiciones for insert to authenticated with check (public.tiene_acceso());
create policy pienso_reposiciones_cambio on public.pienso_reposiciones for update to authenticated
  using (public.es_profesor() or (autor = auth.uid() and creado > now() - interval '24 hours'))
  with check (public.es_profesor() or (autor = auth.uid() and creado > now() - interval '24 hours'));
create policy pienso_reposiciones_borrado on public.pienso_reposiciones for delete to authenticated
  using (public.es_profesor() or (autor = auth.uid() and creado > now() - interval '24 hours'));
create policy pienso_incidencias_alta on public.pienso_incidencias for insert to authenticated with check (public.tiene_acceso());
create policy pienso_incidencias_cambio on public.pienso_incidencias for update to authenticated
  using (public.es_profesor() or (autor = auth.uid() and creado > now() - interval '24 hours'))
  with check (public.es_profesor() or (autor = auth.uid() and creado > now() - interval '24 hours'));
create policy pienso_incidencias_borrado on public.pienso_incidencias for delete to authenticated
  using (public.es_profesor() or (autor = auth.uid() and creado > now() - interval '24 hours'));

-- ---------- Historial (solo lo ve el administrador)
do $$
declare t text;
begin
  if to_regprocedure('public.anotar_historial()') is null then return; end if;
  foreach t in array array['silos', 'piensos', 'pienso_reposiciones', 'pienso_incidencias'] loop
    execute format('drop trigger if exists %1$s_historial on public.%1$s', t);
    execute format('create trigger %1$s_historial after insert or update or delete on public.%1$s for each row execute function public.anotar_historial()', t);
  end loop;
end $$;
