-- =====================================================================
-- CIFEAFARM · Administrador, historial, eliminar personas y protocolos
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible:
-- se puede ejecutar varias veces y no borra ningún dato al ejecutarlo.
-- Si alguna vez vuelves a ejecutar 05_veterinaria.sql, ejecuta después este.
--
-- 1. Un solo administrador (el profesor que creó la app). Los demás
--    profesores y la veterinaria trabajan en la granja, pero no ven el
--    historial, ni los avisos de repetidos, ni gestionan personas.
-- 2. Historial: cada alta, cambio o borrado y cada entrada en la app,
--    con fecha, hora y quién. Solo lo ve el administrador.
-- 3. Eliminar personas (alumnos, profesores, veterinaria). Sus registros
--    de la granja se conservan, firmados con su alias.
-- 4. Tareas de los protocolos diarios marcadas como hechas.
-- 5. Avisos de operaciones repetidas que el administrador da por buenas.
-- =====================================================================

-- ---------- 1. Administrador único
alter table public.perfiles add column if not exists admin boolean not null default false;
-- La primera vez: el profesor más antiguo es el administrador.
update public.perfiles set admin = true
 where user_id = (select user_id from public.perfiles where rol = 'profesor' and activo order by creado limit 1)
   and not exists (select 1 from public.perfiles where admin);

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where user_id = auth.uid() and admin and activo);
$$;

-- ---------- 2. Historial de actividad
create table if not exists public.historial (
  id          bigint generated always as identity primary key,
  creado      timestamptz not null default now(),
  user_id     uuid,
  alias       text,
  rol         text,
  curso       smallint,
  accion      text not null check (accion in ('entrar', 'alta', 'cambio', 'borrado')),
  tabla       text,
  registro_id text,
  datos       jsonb
);
create index if not exists historial_creado on public.historial (creado desc);
create index if not exists historial_alias on public.historial (alias, creado desc);
alter table public.historial enable row level security;
drop policy if exists historial_ver on public.historial;
create policy historial_ver on public.historial for select to authenticated using (public.es_admin());

create or replace function public.anotar_historial() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text; r text; g smallint; o jsonb; n jsonb; d jsonb;
begin
  select alias, rol, granja_id into a, r, g from perfiles where user_id = auth.uid();
  if tg_op = 'INSERT' then n := to_jsonb(new); d := n;
  elsif tg_op = 'DELETE' then o := to_jsonb(old); d := o;
  else
    o := to_jsonb(old); n := to_jsonb(new);
    select jsonb_object_agg(key, jsonb_build_object('antes', o -> key, 'despues', value)) into d
      from jsonb_each(n) where (o -> key) is distinct from value and key not in ('modificado', 'modificado_por');
    if d is null then return null; end if;   -- nada cambió de verdad
  end if;
  insert into historial (user_id, alias, rol, curso, accion, tabla, registro_id, datos)
  values (auth.uid(), a, r, g,
          case tg_op when 'INSERT' then 'alta' when 'UPDATE' then 'cambio' else 'borrado' end,
          tg_table_name, coalesce(n, o) ->> (case when tg_table_name = 'perfiles' then 'user_id' else 'id' end), d);
  return null;
end $$;

-- Cada entrada en la app (la app la anota una vez por sesión)
create or replace function public.anotar_entrada(modulo text) returns void
language plpgsql security definer set search_path = public as $$
declare a text; r text; g smallint;
begin
  if auth.uid() is null then return; end if;
  select alias, rol, granja_id into a, r, g from perfiles where user_id = auth.uid();
  insert into historial (user_id, alias, rol, curso, accion, tabla) values (auth.uid(), a, r, g, 'entrar', left(modulo, 20));
end $$;
revoke all on function public.anotar_entrada(text) from public, anon;
grant execute on function public.anotar_entrada(text) to authenticated;

-- ---------- 3. Eliminar una persona (conserva sus registros con su alias)
create or replace function public.eliminar_persona(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede eliminar personas'; end if;
  if p_user = auth.uid() then raise exception 'No puedes eliminarte a ti mismo'; end if;
  if exists (select 1 from perfiles where user_id = p_user and admin) then raise exception 'No se puede eliminar al administrador'; end if;
  delete from perfiles where user_id = p_user;
  begin
    delete from auth.users where id = p_user;   -- su acceso desaparece del todo
  exception when others then null;              -- si no se puede, ya no tiene perfil: no puede entrar
  end;
end $$;
revoke all on function public.eliminar_persona(uuid) from public, anon;
grant execute on function public.eliminar_persona(uuid) to authenticated;

-- ---------- 4. Tareas de los protocolos marcadas como hechas
create table if not exists public.protocolo_hechas (
  id          uuid primary key default gen_random_uuid(),
  granja      text not null check (granja in ('rumi', 'porc')),
  tarea       text not null,
  periodo     text not null,            -- día, quincena, mes… al que corresponde
  autor       uuid references auth.users(id) on delete set null,
  autor_alias text,
  curso       smallint,
  creado      timestamptz not null default now(),
  unique (granja, tarea, periodo)
);
create or replace function public.protocolo_autoria() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.autor := auth.uid(); new.creado := now();
  select alias, granja_id into new.autor_alias, new.curso from perfiles where user_id = auth.uid();
  return new;
end $$;
drop trigger if exists protocolo_autoria on public.protocolo_hechas;
create trigger protocolo_autoria before insert on public.protocolo_hechas for each row execute function public.protocolo_autoria();
alter table public.protocolo_hechas enable row level security;
drop policy if exists protocolo_ver on public.protocolo_hechas;
drop policy if exists protocolo_alta on public.protocolo_hechas;
drop policy if exists protocolo_borrado on public.protocolo_hechas;
create policy protocolo_ver on public.protocolo_hechas for select to authenticated using (public.tiene_acceso());
create policy protocolo_alta on public.protocolo_hechas for insert to authenticated with check (public.tiene_acceso());
create policy protocolo_borrado on public.protocolo_hechas for delete to authenticated
  using (public.es_profesor() or (autor = auth.uid() and creado > now() - interval '24 hours'));

-- ---------- 5. Operaciones repetidas que el administrador da por buenas
create table if not exists public.avisos_descartados (
  clave  text primary key,
  creado timestamptz not null default now(),
  alias  text
);
alter table public.avisos_descartados enable row level security;
drop policy if exists avisos_descartados_todo on public.avisos_descartados;
create policy avisos_descartados_todo on public.avisos_descartados for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ---------- 6. El historial se anota solo en todas las tablas de la granja
do $$
declare t text;
begin
  foreach t in array array['rum_animales','rum_eventos','rum_sanidad','rum_lotes','rum_manejo','rum_corralinas',
                           'medicamentos','cerdas','verracos','eventos','sanidad','extracciones','recuentos',
                           'mov_grupos','censo_mov','granjas','perfiles','protocolo_hechas'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists %1$s_historial on public.%1$s', t);
    execute format('create trigger %1$s_historial after insert or update or delete on public.%1$s for each row execute function public.anotar_historial()', t);
  end loop;
end $$;
