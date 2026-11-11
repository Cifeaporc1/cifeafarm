-- =====================================================================
-- CIFEAFARM · Tres granjas: GRANJA 1.º, GRANJA 2.º y GRANJA MADRE
-- Antes de ejecutarlo: descarga la copia de seguridad desde la app.
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible:
-- se puede ejecutar varias veces y no borra ningún dato.
--
-- 1. Cada registro de las granjas (rumiantes y porcino) lleva su granja:
--    1 = GRANJA 1.º, 2 = GRANJA 2.º, 3 = GRANJA MADRE (registro oficial).
-- 2. Los alumnos solo ven y tocan la granja de su curso. La veterinaria,
--    la de 2.º. El administrador elige en cada momento en cuál trabaja
--    y el resto de profesores, las que les asigne.
-- 3. Todo lo que había pasa a GRANJA 2.º y se copia a GRANJA MADRE.
--    GRANJA 1.º empieza vacía.
-- 4. Bandeja «Pasar a MADRE»: lo que meten 1.º y 2.º se revisa y se pasa
--    (o no) a MADRE. Se detectan duplicados, cambios y borrados.
-- Comunes a las tres: medicamentos, almacén, roturas, silos y fichas de
-- pienso, corralinas y personas.
-- =====================================================================

-- ---------- 1. Granjas y a qué granja entra cada persona
insert into public.granjas (id, nombre) values (1, 'GRANJA 1.º'), (2, 'GRANJA 2.º'), (3, 'GRANJA MADRE') on conflict (id) do nothing;
update public.granjas set nombre = case id when 1 then 'GRANJA 1.º' when 2 then 'GRANJA 2.º' else 'GRANJA MADRE' end where id in (1, 2, 3);
alter table public.perfiles add column if not exists granjas smallint[] not null default '{}';
alter table public.perfiles add column if not exists granja_activa smallint;
-- La veterinaria entra a GRANJA 2.º; el administrador empieza en 2.º y cambia cuando quiera
update public.perfiles set granjas = '{2}' where rol = 'veterinario' and granjas = '{}';
update public.perfiles set granja_activa = 2 where admin and granja_activa is null;

-- Granja en la que trabaja ahora quien hace la consulta.
-- cifea.granja: la usa la propia base de datos al pasar datos de una granja a otra.
create or replace function public.granja_activa() returns smallint
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(current_setting('cifea.granja', true), '')::smallint,
    (select case when p.rol = 'alumno' then p.granja_id
                 when p.admin then coalesce(p.granja_activa, 2)
                 when p.granja_activa = any(p.granjas) then p.granja_activa
                 else p.granjas[1] end
       from perfiles p where p.user_id = auth.uid() and p.activo),
    2);
$$;
-- ¿Puede entrar esta persona a esta granja?
create or replace function public.puede_granja(g smallint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_setting('cifea.granja', true), '') <> ''
      or exists (select 1 from perfiles p left join granjas gr on gr.id = p.granja_id
                 where p.user_id = auth.uid() and p.activo
                   and (p.admin
                        or (p.rol = 'alumno' and p.granja_id = g and g in (1, 2) and coalesce(gr.acceso, true))
                        or (p.rol <> 'alumno' and g = any(p.granjas))));
$$;
-- Cambiar de granja (el administrador a cualquiera; los demás, a las suyas)
create or replace function public.elegir_granja(g smallint) returns smallint
language plpgsql security definer set search_path = public as $$
begin
  if g not in (1, 2, 3) then raise exception 'Esa granja no existe'; end if;
  if not public.puede_granja(g) or exists (select 1 from perfiles where user_id = auth.uid() and rol = 'alumno') then
    raise exception 'No tienes acceso a esa granja'; end if;
  update perfiles set granja_activa = g where user_id = auth.uid();
  return g;
end $$;
revoke all on function public.elegir_granja(smallint) from public, anon;
grant execute on function public.elegir_granja(smallint) to authenticated;

-- ---------- 2a. Vínculos entre lo de los cursos y lo de MADRE
create table if not exists public.granja_vinculos (
  origen_granja smallint not null,
  origen_id     uuid not null,
  tabla         text not null,
  madre_id      uuid not null,
  huella        text,                -- cómo era el registro al pasarlo (para saber si cambió después)
  pasado        timestamptz not null default now(),
  pasado_por    text,
  primary key (origen_granja, origen_id)
);
create index if not exists granja_vinculos_madre on public.granja_vinculos (madre_id);
create table if not exists public.granja_descartes (
  origen_granja smallint not null,
  origen_id     uuid not null,
  tabla         text not null,
  huella        text,
  creado        timestamptz not null default now(),
  primary key (origen_granja, origen_id)
);
alter table public.granja_vinculos enable row level security;
alter table public.granja_descartes enable row level security;
drop policy if exists granja_vinculos_admin on public.granja_vinculos;
drop policy if exists granja_descartes_admin on public.granja_descartes;
create policy granja_vinculos_admin on public.granja_vinculos for select to authenticated using (public.es_admin());
create policy granja_descartes_admin on public.granja_descartes for select to authenticated using (public.es_admin());

-- ---------- 2. Columna granja_id en todas las tablas de las granjas
do $$
declare t text;
begin
  foreach t in array array['rum_animales','rum_eventos','rum_sanidad','rum_lotes','rum_manejo',
                           'cerdas','verracos','eventos','sanidad','extracciones','recuentos','mov_grupos','censo_mov',
                           'protocolo_hechas','pienso_reposiciones','pienso_incidencias','correcciones'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I add column if not exists granja_id smallint', t);
    -- La primera vez (aún no hay vínculos), todo lo que había pasa a GRANJA 2.º
    -- (en censo_mov y en eventos antiguos podía estar el curso de quien lo anotó)
    if not exists (select 1 from public.granja_vinculos) then
      execute format('update public.%I set granja_id = 2 where granja_id is distinct from 3', t);
    else
      execute format('update public.%I set granja_id = 2 where granja_id is null', t);
    end if;
    execute format('alter table public.%I alter column granja_id set default public.granja_activa()', t);
    execute format('alter table public.%I alter column granja_id set not null', t);
    execute format('create index if not exists %1$s_granja on public.%1$s (granja_id)', t);
    -- Solo se ve y se toca la granja en la que se trabaja (y solo si se tiene acceso)
    execute format('drop policy if exists %1$s_granja on public.%1$s', t);
    execute format('create policy %1$s_granja on public.%1$s as restrictive for all to authenticated
                      using (granja_id = public.granja_activa() and public.puede_granja(granja_id))
                      with check (granja_id = public.granja_activa() and public.puede_granja(granja_id))', t);
  end loop;
end $$;

-- Porcino: las altas ya no se limitan a la granja 2 (lo decide la granja de cada uno)
do $$
declare t text;
begin
  foreach t in array array['eventos', 'sanidad', 'extracciones', 'recuentos', 'mov_grupos'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %1$s_alta on public.%1$s', t);
    execute format('create policy %1$s_alta on public.%1$s for insert to authenticated with check (public.tiene_acceso())', t);
  end loop;
end $$;

-- Crotales, números de manejo y tareas: únicos dentro de cada granja
alter table public.cerdas drop constraint if exists cerdas_crotal_key;
drop index if exists public.cerdas_crotal_key;
create unique index if not exists cerdas_granja_crotal on public.cerdas (granja_id, crotal);
alter table public.verracos drop constraint if exists verracos_crotal_key;
drop index if exists public.verracos_crotal_key;
create unique index if not exists verracos_granja_crotal on public.verracos (granja_id, crotal);
drop index if exists public.rum_animales_crotal;
create unique index if not exists rum_animales_granja_crotal on public.rum_animales (granja_id, crotal) where crotal is not null;
drop index if exists public.rum_animales_manejo;
create unique index if not exists rum_animales_granja_manejo on public.rum_animales (granja_id, especie, upper(manejo)) where manejo is not null and fecha_baja is null;
alter table public.protocolo_hechas drop constraint if exists protocolo_hechas_granja_tarea_periodo_key;
drop index if exists public.protocolo_hechas_granja_tarea_periodo_key;
create unique index if not exists protocolo_hechas_unica on public.protocolo_hechas (granja_id, granja, tarea, periodo);

-- El registro del censo de porcino va a la granja del animal (antes, al curso de quien lo anotaba)
create or replace function public.censo_registro() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text; tipo text := case when tg_table_name = 'cerdas' then 'cerda' else 'verraco' end;
begin
  select alias into a from perfiles where user_id = auth.uid();
  if tg_op = 'INSERT' then
    insert into censo_mov (animal, animal_id, crotal, mov, fecha, granja_id, autor, autor_alias)
      values (tipo, new.id, new.crotal, 'alta', coalesce(new.fecha_entrada, current_date), new.granja_id, auth.uid(), a);
  end if;
  if new.fecha_baja is not null and (tg_op = 'INSERT' or old.fecha_baja is null) then
    insert into censo_mov (animal, animal_id, crotal, mov, fecha, causa, granja_id, autor, autor_alias)
      values (tipo, new.id, new.crotal, 'baja', new.fecha_baja, new.causa_baja, new.granja_id, auth.uid(), a);
  elsif tg_op = 'UPDATE' and old.fecha_baja is not null and new.fecha_baja is null then
    insert into censo_mov (animal, animal_id, crotal, mov, fecha, causa, granja_id, autor, autor_alias)
      values (tipo, new.id, new.crotal, 'baja_anulada', current_date, old.causa_baja, new.granja_id, auth.uid(), a);
  end if;
  return null;
end $$;

-- Importar el censo de rumiantes: madres y padres de la misma granja
create or replace function public.rum_importar(filas jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare f jsonb; n integer := 0; m uuid; p uuid; vuelta integer; g smallint := public.granja_activa();
begin
  if not exists (select 1 from perfiles where user_id = auth.uid() and rol in ('profesor', 'veterinario') and activo) then
    raise exception 'Solo el profesor o la veterinaria pueden importar el censo'; end if;
  for vuelta in 1..2 loop
    for f in select * from jsonb_array_elements(filas) loop
      continue when (f->>'categoria' in ('cabrito','cordero')) <> (vuelta = 2);
      m := null; p := null;
      if coalesce(f->>'madre', '') <> '' then
        select id into m from rum_animales where granja_id = g and especie = f->>'especie' and fecha_baja is null and upper(manejo) = upper(f->>'madre') limit 1;
      end if;
      if coalesce(f->>'padre', '') <> '' then
        select id into p from rum_animales where granja_id = g and especie = f->>'especie' and fecha_baja is null and upper(manejo) = upper(f->>'padre') limit 1;
      end if;
      insert into rum_animales (granja_id, especie, categoria, sexo, crotal, manejo, capa, fecha_nacimiento, anio_nacimiento,
                                madre_id, padre_id, madre_txt, padre_txt, origen, corralina_id, fecha_alta, motivo_alta, obs, importado)
      values (g, f->>'especie', f->>'categoria', nullif(f->>'sexo', ''), nullif(f->>'crotal', ''), nullif(f->>'manejo', ''),
              nullif(f->>'capa', ''), nullif(f->>'fecha_nacimiento', '')::date, nullif(f->>'anio_nacimiento', '')::smallint,
              m, p, case when m is null then nullif(f->>'madre', '') end, case when p is null then nullif(f->>'padre', '') end,
              nullif(f->>'origen', ''), nullif(f->>'corralina_id', '')::smallint,
              coalesce(nullif(f->>'fecha_alta', '')::date, current_date), 'Censo inicial', nullif(f->>'obs', ''), true);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

-- Tablas que se pasan a MADRE, en orden (primero los animales, después lo que depende de ellos)
create or replace function public.cifea_tablas() returns text[]
language sql immutable as $$
  select array['rum_animales','cerdas','verracos','rum_lotes','rum_eventos','rum_sanidad','rum_manejo',
               'eventos','sanidad','extracciones','recuentos','mov_grupos','protocolo_hechas','pienso_reposiciones','pienso_incidencias'];
$$;
-- Huella de un registro: sus datos sin lo que cambia solo
create or replace function public.cifea_huella(j jsonb) returns text
language sql immutable as $$
  select md5((j - array['id','granja_id','modificado','modificado_por','creado','autor','autor_alias','curso','alta_autor','alta_por','baja_por','codigo_cria'])::text);
$$;
-- Cambia los identificadores de la granja de origen por los de MADRE
create or replace function public.cifea_traducir(j jsonb, origen smallint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t text := j::text; u text; n uuid;
begin
  for u in select distinct m[1] from regexp_matches(t, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g') m loop
    select madre_id into n from granja_vinculos where origen_granja = origen and origen_id = u::uuid;
    if n is not null then t := replace(t, u, n::text); end if;
  end loop;
  return t::jsonb;
end $$;

-- ¿Este identificador es de un registro de la granja de origen? Devuelve la tabla o null
create or replace function public.cifea_tabla_de(u uuid, g smallint) returns text
language plpgsql stable security definer set search_path = public as $$
declare t text; hay boolean;
begin
  foreach t in array public.cifea_tablas() loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select exists (select 1 from public.%I where id = $1 and granja_id = $2)', t) into hay using u, g;
    if hay then return t; end if;
  end loop;
  return null;
end $$;

-- Busca en MADRE el mismo animal (por crotal; en rumiantes también por nº de manejo o código de cría)
create or replace function public.cifea_mismo_animal(t text, j jsonb) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare r uuid;
begin
  if t = 'rum_animales' then
    if j->>'crotal' is not null then select id into r from rum_animales where granja_id = 3 and crotal = j->>'crotal' limit 1; end if;
    if r is null and j->>'manejo' is not null then select id into r from rum_animales where granja_id = 3 and especie = j->>'especie' and upper(manejo) = upper(j->>'manejo') and fecha_baja is null limit 1; end if;
    if r is null and j->>'crotal' is null and j->>'codigo_cria' is not null then select id into r from rum_animales where granja_id = 3 and especie = j->>'especie' and codigo_cria = j->>'codigo_cria' and crotal is null limit 1; end if;
  elsif t in ('cerdas', 'verracos') then
    execute format('select id from public.%I where granja_id = 3 and upper(crotal) = upper($1) limit 1', t) into r using j->>'crotal';
  end if;
  return r;
end $$;

-- Un registro igual en MADRE (para no duplicar). j ya traducido a los identificadores de MADRE.
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
  end if;
  return r;
end $$;

-- Registros que la base de datos crea sola al dar de alta o baja un animal: no se pasan, MADRE los crea
create or replace function public.cifea_automatico(t text, j jsonb) returns boolean
language sql immutable as $$
  select (t = 'rum_eventos' and j->>'tipo' in ('alta', 'baja', 'baja_anulada', 'datos', 'acrotalado'));
$$;

-- Pasa un registro de un curso a MADRE. accion: pasar | vincular | actualizar | descartar | borrar
create or replace function public.cifea_pasar(t text, g smallint, oid uuid, accion text, profundidad int default 0) returns text
language plpgsql security definer set search_path = public as $$
declare j jsonb; tr jsonb; u text; ref uuid; dep text; mismo uuid; nuevo uuid := gen_random_uuid(); v granja_vinculos; dup uuid;
begin
  if profundidad > 6 then raise exception 'Demasiados registros encadenados'; end if;
  if t <> all (public.cifea_tablas()) then raise exception 'Tabla desconocida'; end if;
  if g not in (1, 2) then raise exception 'Solo se pasa desde GRANJA 1.º o GRANJA 2.º'; end if;
  select * into v from granja_vinculos where origen_granja = g and origen_id = oid;
  execute format('select to_jsonb(x) from public.%I x where id = $1 and granja_id = $2', t) into j using oid, g;

  if accion = 'borrar' then   -- se borró en el curso: se borra también en MADRE
    if v.madre_id is not null then execute format('delete from public.%I where id = $1 and granja_id = 3', t) using v.madre_id; end if;
    delete from granja_vinculos where origen_granja = g and origen_id = oid;
    return 'borrado';
  end if;
  if accion = 'olvidar' then   -- borrado en el curso, pero se mantiene en MADRE
    delete from granja_vinculos where origen_granja = g and origen_id = oid;
    return 'mantenido';
  end if;
  if j is null then raise exception 'Ese registro ya no existe'; end if;
  if accion = 'descartar' then
    insert into granja_descartes (origen_granja, origen_id, tabla, huella) values (g, oid, t, public.cifea_huella(j))
      on conflict (origen_granja, origen_id) do update set huella = excluded.huella, creado = now();
    return 'descartado';
  end if;
  if accion in ('pasar', 'vincular') and v.madre_id is not null then return 'ya estaba'; end if;

  -- Lo que se nombra dentro (animales, lotes, crías…) tiene que estar ya en MADRE: si no, se pasa antes
  for u in select distinct m[1] from regexp_matches(j::text, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g') m loop
    ref := u::uuid;
    continue when ref = oid or exists (select 1 from granja_vinculos where origen_granja = g and origen_id = ref);
    dep := public.cifea_tabla_de(ref, g);
    continue when dep is null;      -- no es de la granja (persona, medicamento, silo…)
    perform public.cifea_pasar(dep, g, ref, 'pasar', profundidad + 1);
  end loop;
  tr := public.cifea_traducir(j, g);
  perform set_config('cifea.granja', '3', true);

  if accion = 'actualizar' then
    if v.madre_id is null then raise exception 'No estaba en MADRE'; end if;
    tr := tr - array['id','granja_id','creado','autor','autor_alias','curso','alta_autor','alta_por','baja_por','modificado','modificado_por'];
    execute format('update public.%I x set (%s) = (select %s from jsonb_populate_record(x, $1) r) where id = $2 and granja_id = 3', t,
      (select string_agg(quote_ident(k), ', ') from jsonb_object_keys(tr) k),
      (select string_agg('r.' || quote_ident(k), ', ') from jsonb_object_keys(tr) k)) using tr, v.madre_id;
    update granja_vinculos set huella = public.cifea_huella(j), pasado = now(), pasado_por = (select alias from perfiles where user_id = auth.uid())
      where origen_granja = g and origen_id = oid;
    perform set_config('cifea.granja', '', true);
    return 'actualizado';
  end if;

  dup := public.cifea_duplicado(t, tr);
  if dup is not null or accion = 'vincular' then
    if dup is null then raise exception 'No hay nada igual en MADRE con lo que vincularlo'; end if;
    insert into granja_vinculos (origen_granja, origen_id, tabla, madre_id, huella, pasado_por)
      values (g, oid, t, dup, public.cifea_huella(j), (select alias from perfiles where user_id = auth.uid()));
    perform set_config('cifea.granja', '', true);
    return 'vinculado';
  end if;
  if public.cifea_automatico(t, j) then   -- MADRE ya lo crea sola
    perform set_config('cifea.granja', '', true);
    insert into granja_descartes (origen_granja, origen_id, tabla, huella) values (g, oid, t, public.cifea_huella(j)) on conflict do nothing;
    return 'automatico';
  end if;
  tr := jsonb_set(jsonb_set(tr, '{id}', to_jsonb(nuevo)), '{granja_id}', '3');
  execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', t, t) using tr;
  insert into granja_vinculos (origen_granja, origen_id, tabla, madre_id, huella, pasado_por)
    values (g, oid, t, nuevo, public.cifea_huella(j), (select alias from perfiles where user_id = auth.uid()));
  perform set_config('cifea.granja', '', true);
  return 'pasado';
end $$;

-- La bandeja: lo de 1.º y 2.º que no está en MADRE, lo que cambió después de pasarlo y lo que se borró
create or replace function public.pendientes_madre() returns table (granja smallint, tabla text, id uuid, estado text, fecha date, datos jsonb, duplicado boolean, autor_alias text, curso smallint)
language plpgsql security definer set search_path = public as $$
declare t text; r record; h text;
begin
  if not public.es_admin() then raise exception 'Solo el administrador'; end if;
  foreach t in array public.cifea_tablas() loop
    if to_regclass('public.' || t) is null then continue; end if;
    for r in execute format('select x.granja_id g, x.id, to_jsonb(x) j, v.origen_id is not null vinc, v.huella vh, d.huella dh
                               from public.%I x
                               left join granja_vinculos v on v.origen_granja = x.granja_id and v.origen_id = x.id
                               left join granja_descartes d on d.origen_granja = x.granja_id and d.origen_id = x.id
                              where x.granja_id in (1, 2)', t) loop
      if public.cifea_automatico(t, r.j) then continue; end if;
      h := public.cifea_huella(r.j);
      if r.vinc and r.vh is not distinct from h then continue; end if;
      if not r.vinc and r.dh is not distinct from h then continue; end if;
      granja := r.g; tabla := t; id := r.id; datos := r.j;
      fecha := coalesce((r.j->>'fecha')::date, (r.j->>'fecha_alta')::date, (r.j->>'fecha_entrada')::date, (r.j->>'creado')::date);
      autor_alias := coalesce(r.j->>'autor_alias', r.j->>'alta_por', r.j->>'modificado_por'); curso := (r.j->>'curso')::smallint;
      if r.vinc then estado := 'cambiado'; duplicado := false;
      else estado := 'nuevo'; duplicado := public.cifea_duplicado(t, public.cifea_traducir(r.j, r.g)) is not null; end if;
      return next;
    end loop;
    -- Borrados en el curso después de pasarlos (si siguen en MADRE)
    for r in execute format('select v.origen_granja g, v.origen_id, to_jsonb(m) j from granja_vinculos v join public.%1$I m on m.id = v.madre_id
                              where v.tabla = %2$L and v.origen_granja in (1, 2) and not exists (select 1 from public.%1$I x where x.id = v.origen_id)', t, t) loop
      granja := r.g; tabla := t; id := r.origen_id; estado := 'borrado'; duplicado := false; datos := r.j; autor_alias := null; curso := null;
      fecha := coalesce((r.j->>'fecha')::date, (r.j->>'fecha_alta')::date, (r.j->>'fecha_entrada')::date);
      return next;
    end loop;
  end loop;
end $$;
revoke all on function public.pendientes_madre() from public, anon;
grant execute on function public.pendientes_madre() to authenticated;

-- Aplica la decisión del administrador a varios registros. items: [{tabla, granja, id, accion}]
create or replace function public.pasar_madre(items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it jsonb; res jsonb := '[]'::jsonb; r text;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede pasar datos a MADRE'; end if;
  for it in select x from jsonb_array_elements(items) x
             order by array_position(public.cifea_tablas(), x->>'tabla'), x->>'fecha' loop
    begin
      r := public.cifea_pasar(it->>'tabla', (it->>'granja')::smallint, (it->>'id')::uuid, it->>'accion');
      res := res || jsonb_build_object('id', it->>'id', 'ok', true, 'resultado', r);
    exception when others then
      perform set_config('cifea.granja', '', true);
      res := res || jsonb_build_object('id', it->>'id', 'ok', false, 'error', sqlerrm);
    end;
  end loop;
  return res;
end $$;
revoke all on function public.pasar_madre(jsonb) from public, anon;
grant execute on function public.pasar_madre(jsonb) to authenticated;

-- Traer a un curso el censo de MADRE (altas y bajas de animales, sin su historia)
create or replace function public.traer_censo(destino smallint) returns integer
language plpgsql security definer set search_path = public as $$
declare t text; r record; j jsonb; n integer := 0; nuevo uuid; c uuid; lado text;
begin
  if not public.es_admin() then raise exception 'Solo el administrador'; end if;
  if destino not in (1, 2) then raise exception 'Elige GRANJA 1.º o GRANJA 2.º'; end if;
  perform set_config('cifea.granja', destino::text, true);
  foreach t in array array['rum_animales', 'cerdas', 'verracos'] loop
    for r in execute format('select x.id, to_jsonb(x) j from public.%I x where x.granja_id = 3 order by %s x.creado', t,
                            case when t = 'rum_animales' then '(x.categoria in (''cabrito'', ''cordero'')), coalesce(x.fecha_nacimiento, x.fecha_alta),' else '' end) loop
      select v.origen_id into c from granja_vinculos v where v.origen_granja = destino and v.madre_id = r.id;
      if c is null then   -- ¿ya existe en el curso con el mismo crotal?
        if t = 'rum_animales' then
          select id into c from rum_animales where granja_id = destino and ((r.j->>'crotal' is not null and crotal = r.j->>'crotal')
            or (r.j->>'crotal' is null and r.j->>'manejo' is not null and especie = r.j->>'especie' and upper(manejo) = upper(r.j->>'manejo')));
        else execute format('select id from public.%I where granja_id = $1 and upper(crotal) = upper($2)', t) into c using destino, r.j->>'crotal'; end if;
        if c is not null then
          execute format('insert into granja_vinculos (origen_granja, origen_id, tabla, madre_id, huella) select $1, $2, $3, $4, public.cifea_huella(to_jsonb(x)) from public.%I x where x.id = $2 on conflict do nothing', t) using destino, c, t, r.id;
        end if;
      end if;
      if c is null then
        nuevo := gen_random_uuid();
        j := r.j;
        if t = 'rum_animales' then   -- madre y padre con los identificadores del curso (si ya están); si no, su código como texto
          j := jsonb_set(j, '{madre_id}', coalesce(to_jsonb((select v.origen_id from granja_vinculos v where v.origen_granja = destino and v.madre_id = (r.j->>'madre_id')::uuid)), 'null'::jsonb));
          j := jsonb_set(j, '{padre_id}', coalesce(to_jsonb((select v.origen_id from granja_vinculos v where v.origen_granja = destino and v.madre_id = (r.j->>'padre_id')::uuid)), 'null'::jsonb));
          if j->>'madre_id' is null and r.j->>'madre_id' is not null then
            j := jsonb_set(j, '{madre_txt}', to_jsonb((select coalesce(m.manejo, m.crotal, m.codigo_cria, '?') from rum_animales m where m.id = (r.j->>'madre_id')::uuid)));
          end if;
          if j->>'padre_id' is null and r.j->>'padre_id' is not null and r.j->>'padre_txt' is null then
            j := jsonb_set(j, '{padre_txt}', to_jsonb((select coalesce(m.manejo, m.crotal, m.codigo_cria, '?') from rum_animales m where m.id = (r.j->>'padre_id')::uuid)));
          end if;
        end if;
        j := jsonb_set(jsonb_set(j, '{id}', to_jsonb(nuevo)), '{granja_id}', to_jsonb(destino));
        execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', t, t) using j;
        execute format('insert into granja_vinculos (origen_granja, origen_id, tabla, madre_id, huella) select $1, $2, $3, $4, public.cifea_huella(to_jsonb(x)) from public.%I x where x.id = $2', t)
          using destino, nuevo, t, r.id;
        n := n + 1;
      elsif (r.j->>'fecha_baja') is not null then   -- baja en MADRE que el curso no tiene
        if t = 'rum_animales' then
          update rum_animales set fecha_baja = (r.j->>'fecha_baja')::date, causa_baja = r.j->>'causa_baja', destino_baja = r.j->>'destino_baja'
           where id = c and fecha_baja is null;
        else
          execute format('update public.%I set fecha_baja = $2, causa_baja = $3 where id = $1 and fecha_baja is null', t)
            using c, (r.j->>'fecha_baja')::date, r.j->>'causa_baja';
        end if;
        if found then n := n + 1; execute format('update granja_vinculos v set huella = public.cifea_huella(to_jsonb(x)) from public.%I x where x.id = $1 and v.origen_granja = $2 and v.origen_id = $1', t) using c, destino; end if;
      end if;
    end loop;
  end loop;
  perform set_config('cifea.granja', '', true);
  return n;
end $$;
revoke all on function public.traer_censo(smallint) from public, anon;
grant execute on function public.traer_censo(smallint) to authenticated;

-- Crotal o código de animales, de cualquier granja (para que la bandeja diga de qué animal es cada registro)
create or replace function public.nombres_animales(ids uuid[]) returns table (id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select a.id, coalesce(a.crotal, a.manejo, a.codigo_cria) from rum_animales a where a.id = any(ids) and public.es_admin()
  union all select c.id, c.crotal from cerdas c where c.id = any(ids) and public.es_admin()
  union all select v.id, v.crotal from verracos v where v.id = any(ids) and public.es_admin();
$$;
revoke all on function public.nombres_animales(uuid[]) from public, anon;
grant execute on function public.nombres_animales(uuid[]) to authenticated;

-- Última actualización y pendientes de cada granja (para la pantalla de elegir granja)
create or replace function public.estado_granjas() returns table (granja smallint, ultima timestamptz, registros bigint)
language plpgsql security definer set search_path = public as $$
declare t text; q text := '';
begin
  if not exists (select 1 from perfiles where user_id = auth.uid() and activo and rol <> 'alumno') then raise exception 'Sin acceso'; end if;
  foreach t in array public.cifea_tablas() || array['censo_mov'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    q := q || case when q = '' then '' else ' union all ' end
      || format('select granja_id g, greatest(creado, %s) f from public.%I', case when exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t and c.column_name = 'modificado') then 'modificado' else 'creado' end, t);
  end loop;
  return query execute 'select g::smallint, max(f), count(*) from (' || q || ') s where public.puede_granja(g::smallint) group by g order by g';
end $$;
revoke all on function public.estado_granjas() from public, anon;
grant execute on function public.estado_granjas() to authenticated;

-- ---------- 4. La primera vez: copia de todo lo de GRANJA 2.º a GRANJA MADRE
do $$
declare t text; n integer;
begin
  if exists (select 1 from public.granja_vinculos where origen_granja = 2) or
     exists (select 1 from public.rum_animales where granja_id = 3) or exists (select 1 from public.cerdas where granja_id = 3) then
    raise notice 'GRANJA MADRE ya tenía datos: no se vuelve a copiar';
    return;
  end if;
  -- Identificadores nuevos para todo lo de 2.º
  foreach t in array public.cifea_tablas() || array['censo_mov'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('insert into public.granja_vinculos (origen_granja, origen_id, tabla, madre_id, huella, pasado_por)
                    select 2, x.id, %L, gen_random_uuid(), public.cifea_huella(to_jsonb(x)), ''Copia inicial'' from public.%I x where x.granja_id = 2', t, t);
  end loop;
  -- Copia sin disparar los automatismos (conserva autores y fechas)
  foreach t in array public.cifea_tablas() || array['censo_mov'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I disable trigger user', t);
    execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,
                      jsonb_set(public.cifea_traducir(to_jsonb(x), 2::smallint), ''{granja_id}'', ''3''))).* from public.%I x where x.granja_id = 2', t, t, t);
    get diagnostics n = row_count;
    execute format('alter table public.%I enable trigger user', t);
    raise notice 'Copiado a MADRE: % (%)', t, n;
  end loop;
  -- censo_mov no se pasa por la bandeja (lo crea MADRE sola): fuera de los vínculos
  delete from public.granja_vinculos where tabla = 'censo_mov';
end $$;

-- ---------- 5. El informe de uso (DIACLASHOM) no cuenta lo copiado a MADRE
do $$
begin
  if to_regprocedure('public.informe_uso(date, date)') is null then return; end if;
end $$;
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
  for i in 1 .. array_length(fuentes, 1) loop
    if to_regclass('public.' || fuentes[i][1]) is null then continue; end if;
    q := q || case when q = '' then '' else ' union all ' end
      || format('select %L as tabla, %I as uid, (creado at time zone ''Europe/Madrid'')::date as dia from public.%I where granja_id <> 3 and %s',
                fuentes[i][1], fuentes[i][2], fuentes[i][1], fuentes[i][3]);
  end loop;
  execute 'create temp table if not exists _altas (tabla text, uid uuid, dia date) on commit drop';
  execute 'truncate _altas';
  if q <> '' then execute 'insert into _altas ' || q; end if;
  delete from _altas a where a.dia < desde or a.dia > hasta or a.uid is null;

  create temp table if not exists _tareas (uid uuid, dia date) on commit drop; truncate _tareas;
  if to_regclass('public.protocolo_hechas') is not null then
    insert into _tareas select t.autor, (t.creado at time zone 'Europe/Madrid')::date from protocolo_hechas t
      where t.autor is not null and t.granja_id <> 3 and (t.creado at time zone 'Europe/Madrid')::date between desde and hasta;
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

-- ---------- 6. Historial de las tablas nuevas
do $$
begin
  if to_regprocedure('public.anotar_historial()') is null then return; end if;
  drop trigger if exists granja_vinculos_historial on public.granja_vinculos;
end $$;
