-- =====================================================================
-- CIFEAFARM · Cambio de curso: pasar alumnos y granjas de un curso a otro
-- Necesita haber ejecutado antes 18_tres_granjas.sql.
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible:
-- se puede ejecutar varias veces y no borra ningún dato.
--
-- 1. Pasar alumnos (los que elijas o un curso entero) a otro curso.
-- 2. Pasar la granja completa de 1.º a 2.º: lo que tenía 2.º se archiva
--    (solo lo ve el administrador) y 1.º queda vacía.
-- 3. Cerrar el curso de un solo curso (antes cerraba los dos).
-- =====================================================================

-- ---------- Archivos: granjas que ya no usa ningún curso (id 100 en adelante)
alter table public.granjas add column if not exists archivada timestamptz;

-- El administrador puede elegir también una granja archivada para consultarla
create or replace function public.elegir_granja(g smallint) returns smallint
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from granjas where id = g) then raise exception 'Esa granja no existe'; end if;
  if not public.puede_granja(g) or exists (select 1 from perfiles where user_id = auth.uid() and rol = 'alumno') then
    raise exception 'No tienes acceso a esa granja'; end if;
  update perfiles set granja_activa = g where user_id = auth.uid();
  return g;
end $$;

-- ---------- 1. Pasar alumnos a otro curso
create or replace function public.mover_alumnos(ids uuid[], curso smallint) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede cambiar de curso a los alumnos'; end if;
  if curso not in (1, 2) then raise exception 'El curso ha de ser 1 o 2'; end if;
  update perfiles set granja_id = curso where rol = 'alumno' and user_id = any(ids) and granja_id is distinct from curso;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mover_alumnos(uuid[], smallint) from public, anon;
grant execute on function public.mover_alumnos(uuid[], smallint) to authenticated;

-- ---------- 2. Pasar la granja completa de un curso a otro
-- Lo que tenía el destino va a una granja archivada nueva; el origen queda vacío.
create or replace function public.mover_granja(origen smallint, destino smallint, con_alumnos boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t text; arch smallint; n integer; total integer := 0; al integer := 0;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede pasar una granja a otro curso'; end if;
  if origen not in (1, 2) or destino not in (1, 2) or origen = destino then raise exception 'Elige dos cursos distintos (1.º y 2.º)'; end if;
  -- Granja de archivo para lo que había en el destino
  select greatest(100, coalesce(max(id), 0) + 1) into arch from granjas where id >= 100;
  insert into granjas (id, nombre, acceso, archivada)
    values (arch, format('ARCHIVO %s.º · hasta %s', destino, to_char(current_date, 'DD/MM/YYYY')), false, now());
  foreach t in array array['rum_animales','rum_eventos','rum_sanidad','rum_lotes','rum_manejo',
                           'cerdas','verracos','eventos','sanidad','extracciones','recuentos','mov_grupos','censo_mov',
                           'protocolo_hechas','pienso_reposiciones','pienso_incidencias','correcciones'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    -- Sin automatismos: es un cambio de etiqueta, no un registro nuevo (no se apunta en el historial)
    execute format('alter table public.%I disable trigger user', t);
    execute format('update public.%I set granja_id = $1 where granja_id = $2', t) using arch, destino;
    execute format('update public.%I set granja_id = $1 where granja_id = $2', t) using destino, origen;
    get diagnostics n = row_count; total := total + n;
    execute format('alter table public.%I enable trigger user', t);
  end loop;
  -- Lo que ya se había pasado a MADRE sigue unido a su registro
  update granja_vinculos set origen_granja = arch where origen_granja = destino;
  update granja_vinculos set origen_granja = destino where origen_granja = origen;
  update granja_descartes set origen_granja = arch where origen_granja = destino;
  update granja_descartes set origen_granja = destino where origen_granja = origen;
  -- Los alumnos que estaban activos en el origen pasan al destino
  if con_alumnos then
    update perfiles set granja_id = destino where rol = 'alumno' and activo and granja_id = origen;
    get diagnostics al = row_count;
  end if;
  return jsonb_build_object('archivo', arch, 'registros', total, 'alumnos', al);
end $$;
revoke all on function public.mover_granja(smallint, smallint, boolean) from public, anon;
grant execute on function public.mover_granja(smallint, smallint, boolean) to authenticated;

-- ---------- 3. Cerrar el curso: solo los alumnos del curso elegido (sin curso, los dos, como antes)
drop function if exists public.cerrar_curso();
create or replace function public.cerrar_curso(curso smallint default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.es_admin() then raise exception 'Solo el profesor puede cerrar el curso'; end if;
  update perfiles set activo = false, nombre = null where rol = 'alumno' and activo and (curso is null or granja_id = curso);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.cerrar_curso(smallint) from public, anon;
grant execute on function public.cerrar_curso(smallint) to authenticated;
