-- =====================================================================
-- CIFEAFARM · Más permisos para los alumnos en su granja y cambios de la
-- veterinaria anotados. Necesita haber ejecutado antes el 18.
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible:
-- se puede ejecutar varias veces y no borra ningún dato.
--
-- 1. Lo que corrige la veterinaria en registros de otros queda anotado en
--    Correcciones (solo lo ve el administrador), como lo de los alumnos.
-- 2. Los alumnos pueden anular o corregir una baja en su granja.
-- 3. Roturas y almacén pasan a ser de cada granja: los alumnos preparan el
--    material, marcan reparado y llevan el almacén de su curso.
--    Lo que había pasa a GRANJA 2.º y se copia a GRANJA MADRE.
-- =====================================================================

-- ---------- 1. Correcciones de la veterinaria
create or replace function public.registrar_correccion() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text; g smallint; r text;
begin
  select alias, granja_id, rol into a, g, r from perfiles where user_id = auth.uid();
  if r is null or r not in ('alumno', 'veterinario') then return null; end if;
  if (to_jsonb(old) ->> 'autor') = auth.uid()::text then return null; end if;
  if (to_jsonb(old) ->> 'estado') = 'previsto' and (to_jsonb(new) ->> 'estado') = 'realizado' then return null; end if;
  if (to_jsonb(new) - array['modificado','modificado_por']) = (to_jsonb(old) - array['modificado','modificado_por']) then return null; end if;
  insert into correcciones (tabla, registro_id, antes, despues, autor, autor_alias, curso)
    values (tg_table_name, new.id, to_jsonb(old), to_jsonb(new), auth.uid(), a, g);
  return null;
end $$;

-- ---------- 2. Bajas: cualquiera con acceso a la granja puede anularlas o corregirlas
create or replace function public.censo_control() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text; prof boolean; quitar text[] := array['fecha_baja','causa_baja','baja_por','modificado','modificado_por','verraquera'];
begin
  select alias into a from perfiles where user_id = auth.uid();
  prof := auth.uid() is null or es_profesor();   -- sin usuario = SQL Editor (profesor)
  if tg_op = 'INSERT' then
    new.alta_autor := auth.uid(); new.alta_por := a; new.creado := now();
    new.baja_por := case when new.fecha_baja is not null then a end;
    new.modificado := null; new.modificado_por := null;
    return new;
  end if;
  new.alta_autor := old.alta_autor; new.alta_por := old.alta_por; new.creado := old.creado;
  if not prof and not (old.alta_autor = auth.uid() and old.creado > now() - interval '24 hours') then
    if (to_jsonb(new) - quitar) is distinct from (to_jsonb(old) - quitar) then
      raise exception 'Solo el profesor puede cambiar los datos de un animal. Tú puedes darlo de baja o corregir la baja.';
    end if;
  end if;
  if new.fecha_baja is not null and new.causa_baja is null then
    raise exception 'Indica la causa de la baja.';
  end if;
  if old.fecha_baja is null and new.fecha_baja is not null then new.baja_por := a;
  elsif new.fecha_baja is null then new.baja_por := null;
  else new.baja_por := old.baja_por; end if;
  new.modificado := now(); new.modificado_por := a;
  return new;
end $$;

create or replace function public.rum_animales_control() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text; prof boolean; n integer; base text;
  libres text[] := array['fecha_baja','causa_baja','destino_baja','baja_por','modificado','modificado_por'];
begin
  select alias into a from perfiles where user_id = auth.uid();
  prof := auth.uid() is null or es_profesor() or coalesce(current_setting('rum.sistema', true), '') = 'on';
  if new.crotal is not null then new.crotal := nullif(upper(regexp_replace(new.crotal, '\s', '', 'g')), ''); end if;
  if new.manejo is not null then new.manejo := nullif(upper(trim(new.manejo)), ''); end if;
  if tg_op = 'INSERT' then
    new.alta_autor := auth.uid(); new.alta_por := a; new.creado := now();
    new.baja_por := case when new.fecha_baja is not null then a end;
    new.modificado := null; new.modificado_por := null;
    if not prof then new.importado := false; end if;
    if new.categoria in ('cabrito','cordero') and new.crotal is null and new.codigo_cria is null then
      if new.madre_id is not null then
        select coalesce(manejo, codigo_cria, crotal) into base from rum_animales where id = new.madre_id;
        select count(*) into n from rum_animales where madre_id = new.madre_id;
      else
        base := new.madre_txt;
        select count(*) into n from rum_animales where madre_id is null and madre_txt = new.madre_txt and granja_id = new.granja_id;
      end if;
      new.codigo_cria := coalesce(base, '?') || '-' || (n + 1);
    end if;
    return new;
  end if;
  new.alta_autor := old.alta_autor; new.alta_por := old.alta_por; new.creado := old.creado; new.importado := old.importado;
  if not prof and not (old.alta_autor = auth.uid() and old.creado > now() - interval '24 hours') then
    if (to_jsonb(new) - libres) is distinct from (to_jsonb(old) - libres) then
      raise exception 'Solo el profesor puede cambiar los datos de un animal. Tú puedes trasladarlo, darlo de baja o corregir la baja.';
    end if;
  end if;
  if old.fecha_baja is null and new.fecha_baja is not null then new.baja_por := a;
  elsif new.fecha_baja is null then new.baja_por := null; new.causa_baja := null; new.destino_baja := null;
  else new.baja_por := old.baja_por; end if;
  new.modificado := now(); new.modificado_por := a;
  return new;
end $$;

-- ---------- 3. Roturas y almacén, de cada granja
do $$
declare t text; primera boolean;
begin
  foreach t in array array['roturas', 'inv_articulos'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    primera := not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'granja_id');
    execute format('alter table public.%I add column if not exists granja_id smallint', t);
    if primera then
      -- Lo que había, a GRANJA 2.º, y una copia en GRANJA MADRE (las fotos son las mismas)
      execute format('update public.%I set granja_id = 2', t);
      execute format('alter table public.%I disable trigger user', t);
      execute format('insert into public.%I select (jsonb_populate_record(null::public.%I, to_jsonb(x) || jsonb_build_object(''id'', gen_random_uuid(), ''granja_id'', 3))).* from public.%I x where x.granja_id = 2', t, t, t);
      execute format('alter table public.%I enable trigger user', t);
    end if;
    execute format('update public.%I set granja_id = 2 where granja_id is null', t);
    execute format('alter table public.%I alter column granja_id set default public.granja_activa()', t);
    execute format('alter table public.%I alter column granja_id set not null', t);
    execute format('create index if not exists %1$s_granja on public.%1$s (granja_id)', t);
    execute format('drop policy if exists %1$s_granja on public.%1$s', t);
    execute format('create policy %1$s_granja on public.%1$s as restrictive for all to authenticated
                      using (granja_id = public.granja_activa() and public.puede_granja(granja_id))
                      with check (granja_id = public.granja_activa() and public.puede_granja(granja_id))', t);
  end loop;
end $$;
-- Las roturas de la copia de MADRE, sin la referencia a artículos de 2.º: se unen por el nombre
update public.roturas r set materiales = coalesce((
  select jsonb_agg(case when m->>'articulo_id' is null then m
                        else jsonb_set(m, '{articulo_id}', coalesce(to_jsonb((select a3.id from inv_articulos a2 join inv_articulos a3 on a3.granja_id = 3 and a3.nombre = a2.nombre and a3.tipo = a2.tipo
                                                                              where a2.id = (m->>'articulo_id')::uuid and a2.granja_id = 2 limit 1)), 'null'::jsonb)) end)
  from jsonb_array_elements(r.materiales) m), '[]'::jsonb)
 where r.granja_id = 3 and exists (select 1 from jsonb_array_elements(r.materiales) m join inv_articulos a on a.id = (m->>'articulo_id')::uuid and a.granja_id = 2);

-- Almacén: todos (en su granja) dan de alta, cambian cantidades, fotos y precios; borra el profesorado
drop policy if exists inv_admin on public.inv_articulos;
drop policy if exists inv_alta on public.inv_articulos;
drop policy if exists inv_cambio on public.inv_articulos;
drop policy if exists inv_borrado on public.inv_articulos;
create policy inv_alta on public.inv_articulos for insert to authenticated with check (public.tiene_acceso());
create policy inv_cambio on public.inv_articulos for update to authenticated using (public.tiene_acceso()) with check (public.tiene_acceso());
create policy inv_borrado on public.inv_articulos for delete to authenticated using (public.es_profesor());
-- Roturas: todos (en su granja) preparan el material, la reparan y la marcan; borra el administrador
drop policy if exists roturas_cambio on public.roturas;
create policy roturas_cambio on public.roturas for update to authenticated using (public.tiene_acceso()) with check (public.tiene_acceso());

-- Fotos del almacén: también las suben los alumnos
do $$
begin
  if to_regclass('storage.objects') is null then return; end if;
  execute 'drop policy if exists cifeafarm_fotos_subir on storage.objects';
  execute $p$create policy cifeafarm_fotos_subir on storage.objects for insert to authenticated
           with check (bucket_id = 'cifeafarm-fotos' and public.tiene_acceso())$p$;
end $$;
