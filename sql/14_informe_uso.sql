-- =====================================================================
-- CIFEAFARM · Informe de uso por alumno (para DIACLASHOM)
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible:
-- se puede ejecutar varias veces y no borra ningún dato.
--
-- informe_uso(desde, hasta): por cada alumno, entre dos fechas,
--   · dias        días distintos en los que registró algo o marcó tareas
--   · registros   altas de registros en las dos granjas (sin lo importado)
--   · por_tipo    registros por tabla
--   · tareas      tareas del protocolo marcadas como hechas
--   · corregidos  registros suyos que tuvo que corregir otra persona
--   · entradas    veces que abrió la app (desde la versión 0.12.0)
--   · dias_grupo  días con actividad de cualquier alumno de su curso
-- Solo responde al administrador. Lo usa DIACLASHOM con tu cuenta.
-- =====================================================================

create or replace function public.informe_uso(desde date, hasta date)
returns table (user_id uuid, alias text, curso smallint, dias integer, registros integer, por_tipo jsonb,
               tareas integer, corregidos integer, entradas integer, dias_grupo integer)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  q text := '';
  fuentes text[][] := array[
    array['rum_eventos', 'autor', 'coalesce(datos->>''importado'', '''') <> ''true'''],
    array['rum_sanidad', 'autor', 'true'], array['rum_manejo', 'autor', 'true'], array['rum_lotes', 'autor', 'true'],
    array['rum_animales', 'alta_autor', 'not coalesce(importado, false)'],
    array['eventos', 'autor', 'coalesce(datos->>''origen'', '''') <> ''historico'''],
    array['sanidad', 'autor', 'true'], array['extracciones', 'autor', 'true'], array['recuentos', 'autor', 'true'],
    array['mov_grupos', 'autor', 'true'], array['censo_mov', 'autor', 'true'],
    array['cerdas', 'alta_autor', 'true'], array['verracos', 'alta_autor', 'true']];
  i int;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede pedir el informe de uso'; end if;
  -- Todas las altas de las dos granjas: (tabla, quién, día)
  for i in 1 .. array_length(fuentes, 1) loop
    if to_regclass('public.' || fuentes[i][1]) is null then continue; end if;
    q := q || case when q = '' then '' else ' union all ' end
      || format('select %L as tabla, %I as uid, (creado at time zone ''Europe/Madrid'')::date as dia from public.%I where %s',
                fuentes[i][1], fuentes[i][2], fuentes[i][1], fuentes[i][3]);
  end loop;
  execute 'create temp table if not exists _altas (tabla text, uid uuid, dia date) on commit drop';
  execute 'truncate _altas';
  if q <> '' then execute 'insert into _altas ' || q; end if;
  delete from _altas a where a.dia < desde or a.dia > hasta or a.uid is null;

  create temp table if not exists _tareas (uid uuid, dia date) on commit drop; truncate _tareas;
  if to_regclass('public.protocolo_hechas') is not null then
    insert into _tareas select t.autor, (t.creado at time zone 'Europe/Madrid')::date from protocolo_hechas t
      where t.autor is not null and (t.creado at time zone 'Europe/Madrid')::date between desde and hasta;
  end if;

  return query
  with al as (select p.user_id, p.alias, p.granja_id from perfiles p where p.rol = 'alumno'),
  dias_al as (select x.uid, x.dia from _altas x union select t.uid, t.dia from _tareas t),
  grupo as (select a.granja_id, count(distinct d.dia)::int n from dias_al d join al a on a.user_id = d.uid group by a.granja_id),
  tipos as (select x.uid, jsonb_object_agg(x.tabla, x.n) j, sum(x.n)::int n
              from (select uid, tabla, count(*) n from _altas group by uid, tabla) x group by x.uid),
  corr as (select (c.antes->>'autor')::uuid uid, count(*)::int n from correcciones c
             where c.antes->>'autor' is not null and (c.creado at time zone 'Europe/Madrid')::date between desde and hasta
               and c.autor is distinct from (c.antes->>'autor')::uuid group by 1),
  ent as (select h.user_id uid, count(*)::int n from historial h
            where h.accion = 'entrar' and (h.creado at time zone 'Europe/Madrid')::date between desde and hasta group by 1)
  select a.user_id, a.alias, a.granja_id,
         (select count(distinct d.dia)::int from dias_al d where d.uid = a.user_id),
         coalesce(t.n, 0), coalesce(t.j, '{}'::jsonb),
         (select count(*)::int from _tareas x where x.uid = a.user_id),
         coalesce(c.n, 0), coalesce(e.n, 0), coalesce(g.n, 0)
  from al a left join tipos t on t.uid = a.user_id left join corr c on c.uid = a.user_id
       left join ent e on e.uid = a.user_id left join grupo g on g.granja_id = a.granja_id
  order by a.granja_id, a.alias;
end $$;
revoke all on function public.informe_uso(date, date) from public, anon;
grant execute on function public.informe_uso(date, date) to authenticated;
