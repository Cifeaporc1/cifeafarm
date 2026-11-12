-- =====================================================================
-- CIFEAFARM · El almacén y las roturas también se pasan a MADRE
-- Necesita haber ejecutado antes el 18, el 19 y el 20.
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible:
-- se puede ejecutar varias veces y no borra ningún dato.
-- =====================================================================

-- Tablas que se pasan a MADRE (el almacén antes que las roturas, que usan sus artículos)
create or replace function public.cifea_tablas() returns text[]
language sql immutable as $$
  select array['rum_animales','cerdas','verracos','rum_lotes','rum_eventos','rum_sanidad','rum_manejo',
               'eventos','sanidad','extracciones','recuentos','mov_grupos','protocolo_hechas','pienso_reposiciones','pienso_incidencias',
               'inv_articulos','roturas'];
$$;

-- Lo mismo ya en MADRE: un artículo con el mismo nombre, tipo y almacén; una rotura de la misma zona, elemento y día
create or replace function public.cifea_duplicado(t text, j jsonb) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare r uuid;
begin
  if t in ('rum_animales', 'cerdas', 'verracos') then return public.cifea_mismo_animal(t, j); end if;
  if t = 'rum_eventos' then select id into r from rum_eventos where granja_id = 3 and animal_id = (j->>'animal_id')::uuid and tipo = j->>'tipo' and fecha = (j->>'fecha')::date limit 1;
  elsif t = 'eventos' then select id into r from eventos where granja_id = 3 and cerda_id = (j->>'cerda_id')::uuid and tipo = j->>'tipo' and fecha = (j->>'fecha')::date
                                and coalesce(datos->>'otra_cerda', '') = coalesce(j->'datos'->>'otra_cerda', '') limit 1;
  elsif t = 'rum_sanidad' then select id into r from rum_sanidad where granja_id = 3 and tipo = j->>'tipo' and fecha = (j->>'fecha')::date and coalesce(producto, '') = coalesce(j->>'producto', '')
                                and ambito = j->>'ambito' and animales = array(select jsonb_array_elements_text(coalesce(j->'animales', '[]'::jsonb)))::uuid[] limit 1;
  elsif t = 'sanidad' then select id into r from sanidad where granja_id = 3 and tipo = j->>'tipo' and fecha = (j->>'fecha')::date and coalesce(producto, '') = coalesce(j->>'producto', '')
                                and cerda_id is not distinct from (j->>'cerda_id')::uuid and verraco_id is not distinct from (j->>'verraco_id')::uuid and coalesce(zona, '') = coalesce(j->>'zona', '') limit 1;
  elsif t = 'extracciones' then select id into r from extracciones where granja_id = 3 and verraco_id = (j->>'verraco_id')::uuid and fecha = (j->>'fecha')::date limit 1;
  elsif t = 'recuentos' then select id into r from recuentos where granja_id = 3 and estancia = j->>'estancia' and fecha = (j->>'fecha')::date limit 1;
  elsif t = 'mov_grupos' then select id into r from mov_grupos where granja_id = 3 and tipo = j->>'tipo' and fecha = (j->>'fecha')::date and n = (j->>'n')::int
                                and coalesce(origen, '') = coalesce(j->>'origen', '') and coalesce(destino, '') = coalesce(j->>'destino', '') limit 1;
  elsif t = 'rum_lotes' then select id into r from rum_lotes where granja_id = 3 and nombre = j->>'nombre' and especie = j->>'especie' limit 1;
  elsif t = 'rum_manejo' then select id into r from rum_manejo where granja_id = 3 and fecha = (j->>'fecha')::date and to_jsonb(tareas) = j->'tareas' limit 1;
  elsif t = 'protocolo_hechas' then select id into r from protocolo_hechas where granja_id = 3 and granja = j->>'granja' and tarea = j->>'tarea' and periodo = j->>'periodo' limit 1;
  elsif t = 'pienso_reposiciones' then select id into r from pienso_reposiciones where granja_id = 3 and silo_id is not distinct from (j->>'silo_id')::uuid and fecha = (j->>'fecha')::date and kg = (j->>'kg')::numeric limit 1;
  elsif t = 'pienso_incidencias' then select id into r from pienso_incidencias where granja_id = 3 and tipo = j->>'tipo' and fecha = (j->>'fecha')::date and coalesce(zona, '') = coalesce(j->>'zona', '') limit 1;
  elsif t = 'inv_articulos' then select id into r from inv_articulos where granja_id = 3 and upper(nombre) = upper(j->>'nombre') and tipo = j->>'tipo'
                                and almacen_id is not distinct from (j->>'almacen_id')::smallint limit 1;
  elsif t = 'roturas' then select id into r from roturas where granja_id = 3 and granja = j->>'granja' and zona = j->>'zona' and elemento = j->>'elemento'
                                and (creado at time zone 'Europe/Madrid')::date = ((j->>'creado')::timestamptz at time zone 'Europe/Madrid')::date limit 1;
  end if;
  return r;
end $$;

-- Lo que se copió a MADRE al ejecutar el 20 queda unido a su original de 2.º (para que no salga como nuevo)
insert into public.granja_vinculos (origen_granja, origen_id, tabla, madre_id, huella, pasado_por)
select 2, o.id, 'inv_articulos', m.id, public.cifea_huella(to_jsonb(o)), 'Copia inicial'
  from public.inv_articulos o
  join lateral (select x.id from public.inv_articulos x where x.granja_id = 3 and x.nombre = o.nombre and x.tipo = o.tipo
                  and x.almacen_id is not distinct from o.almacen_id and x.creado = o.creado
                  and not exists (select 1 from public.granja_vinculos v where v.madre_id = x.id) limit 1) m on true
 where o.granja_id = 2 and not exists (select 1 from public.granja_vinculos v where v.origen_granja = 2 and v.origen_id = o.id);
insert into public.granja_vinculos (origen_granja, origen_id, tabla, madre_id, huella, pasado_por)
select 2, o.id, 'roturas', m.id, public.cifea_huella(to_jsonb(o)), 'Copia inicial'
  from public.roturas o
  join lateral (select x.id from public.roturas x where x.granja_id = 3 and x.zona = o.zona and x.elemento = o.elemento and x.creado = o.creado
                  and not exists (select 1 from public.granja_vinculos v where v.madre_id = x.id) limit 1) m on true
 where o.granja_id = 2 and not exists (select 1 from public.granja_vinculos v where v.origen_granja = 2 and v.origen_id = o.id);

-- Pasar la granja de 1.º a 2.º también mueve el almacén y las roturas
create or replace function public.mover_granja(origen smallint, destino smallint, con_alumnos boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t text; arch smallint; n integer; total integer := 0; al integer := 0;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede pasar una granja a otro curso'; end if;
  if origen not in (1, 2) or destino not in (1, 2) or origen = destino then raise exception 'Elige dos cursos distintos (1.º y 2.º)'; end if;
  select greatest(100, coalesce(max(id), 0) + 1) into arch from granjas where id >= 100;
  insert into granjas (id, nombre, acceso, archivada)
    values (arch, format('ARCHIVO %s.º · hasta %s', destino, to_char(current_date, 'DD/MM/YYYY')), false, now());
  foreach t in array array['rum_animales','rum_eventos','rum_sanidad','rum_lotes','rum_manejo',
                           'cerdas','verracos','eventos','sanidad','extracciones','recuentos','mov_grupos','censo_mov',
                           'protocolo_hechas','pienso_reposiciones','pienso_incidencias','correcciones','inv_articulos','roturas'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I disable trigger user', t);
    execute format('update public.%I set granja_id = $1 where granja_id = $2', t) using arch, destino;
    execute format('update public.%I set granja_id = $1 where granja_id = $2', t) using destino, origen;
    get diagnostics n = row_count; total := total + n;
    execute format('alter table public.%I enable trigger user', t);
  end loop;
  update granja_vinculos set origen_granja = arch where origen_granja = destino;
  update granja_vinculos set origen_granja = destino where origen_granja = origen;
  update granja_descartes set origen_granja = arch where origen_granja = destino;
  update granja_descartes set origen_granja = destino where origen_granja = origen;
  if con_alumnos then
    update perfiles set granja_id = destino where rol = 'alumno' and activo and granja_id = origen;
    get diagnostics al = row_count;
  end if;
  return jsonb_build_object('archivo', arch, 'registros', total, 'alumnos', al);
end $$;
