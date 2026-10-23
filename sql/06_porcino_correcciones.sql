-- =====================================================================
-- CIFEAFARM · Las dos granjas: los alumnos corrigen lo de otros (y el profesor
--             lo ve), catálogo de productos abierto a los alumnos, lechones
--             destetados que se quedan en la paridera y otros crotales de los verracos.
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible.
-- Necesita haber ejecutado antes 01, 02 y 05.
-- =====================================================================

-- ---------- 1. Registro de correcciones (solo lo ve el profesor)
create table if not exists public.correcciones (
  id           uuid primary key default gen_random_uuid(),
  tabla        text not null,
  registro_id  uuid not null,
  antes        jsonb not null,
  despues      jsonb not null,
  autor        uuid,            -- alumno que corrige
  autor_alias  text,
  curso        smallint,
  creado       timestamptz not null default now(),
  revisada     boolean not null default false,
  revisada_en  timestamptz,
  deshecha     boolean not null default false
);
create index if not exists correcciones_creado on public.correcciones (creado desc);

alter table public.correcciones enable row level security;
drop policy if exists correcciones_ver on public.correcciones;
drop policy if exists correcciones_cambio on public.correcciones;
drop policy if exists correcciones_borrado on public.correcciones;
create policy correcciones_ver on public.correcciones for select to authenticated using (public.es_admin());
create policy correcciones_cambio on public.correcciones for update to authenticated using (public.es_admin()) with check (public.es_admin());
create policy correcciones_borrado on public.correcciones for delete to authenticated using (public.es_admin());
-- (sin permiso de escritura para nadie más: la rellena la base de datos)

-- Se apunta cuando un ALUMNO cambia un registro que no es suyo.
-- No cuenta como corrección marcar como hecho un tratamiento previsto.
create or replace function public.registrar_correccion() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text; g smallint; r text;
begin
  select alias, granja_id, rol into a, g, r from perfiles where user_id = auth.uid();
  if r is distinct from 'alumno' then return null; end if;
  if (to_jsonb(old) ->> 'autor') = auth.uid()::text then return null; end if;
  if (to_jsonb(old) ->> 'estado') = 'previsto' and (to_jsonb(new) ->> 'estado') = 'realizado' then return null; end if;
  if (to_jsonb(new) - array['modificado','modificado_por']) = (to_jsonb(old) - array['modificado','modificado_por']) then return null; end if;
  insert into correcciones (tabla, registro_id, antes, despues, autor, autor_alias, curso)
    values (tg_table_name, new.id, to_jsonb(old), to_jsonb(new), auth.uid(), a, g);
  return null;
end $$;

-- ---------- 2. Cualquier alumno puede corregir cualquier registro de porcino.
--               Borrar, igual que antes: lo suyo durante 24 h; lo demás, el profesor.
do $$
declare t text;
begin
  foreach t in array array['eventos','sanidad','extracciones','recuentos','mov_grupos'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %1$s_cambio on public.%1$s', t);
    execute format('create policy %1$s_cambio on public.%1$s for update to authenticated using (public.tiene_acceso()) with check (public.tiene_acceso())', t);
    execute format('drop trigger if exists %1$s_correccion on public.%1$s', t);
    execute format('create trigger %1$s_correccion after update on public.%1$s for each row execute function public.registrar_correccion()', t);
  end loop;
end $$;

-- ---------- 2 bis. Rumiantes, igual: cualquier alumno corrige y queda apuntado
--                    (las reglas de 01_rumiantes.sql ya lo permiten desde esta versión)
drop policy if exists rum_eventos_cambio on public.rum_eventos;
create policy rum_eventos_cambio on public.rum_eventos for update to authenticated
  using (public.es_profesor()
         or (public.tiene_acceso() and tipo not in ('alta','baja','baja_anulada','datos','parto','acrotalado')))
  with check (public.tiene_acceso());
drop policy if exists rum_sanidad_cambio on public.rum_sanidad;
create policy rum_sanidad_cambio on public.rum_sanidad for update to authenticated using (public.tiene_acceso()) with check (public.tiene_acceso());
drop policy if exists rum_manejo_cambio on public.rum_manejo;
create policy rum_manejo_cambio on public.rum_manejo for update to authenticated using (public.tiene_acceso()) with check (public.tiene_acceso());
do $$
declare t text;
begin
  foreach t in array array['rum_eventos','rum_sanidad','rum_manejo'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists %1$s_correccion on public.%1$s', t);
    execute format('create trigger %1$s_correccion after update on public.%1$s for each row execute function public.registrar_correccion()', t);
  end loop;
end $$;

-- ---------- 3. Catálogo de productos: los alumnos también añaden y completan
--               (enlace a la ficha técnica, lote, caducidad…). Queda quién lo hizo.
alter table public.medicamentos add column if not exists autor uuid, add column if not exists autor_alias text,
  add column if not exists modificado timestamptz, add column if not exists modificado_por text;

create or replace function public.medicamentos_autoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text;
begin
  select alias into a from perfiles where user_id = auth.uid();
  if tg_op = 'INSERT' then
    new.autor := auth.uid(); new.autor_alias := a; new.creado := now(); new.modificado := null; new.modificado_por := null;
  else
    new.autor := old.autor; new.autor_alias := old.autor_alias; new.creado := old.creado; new.modificado := now(); new.modificado_por := a;
  end if;
  return new;
end $$;
drop trigger if exists medicamentos_autoria on public.medicamentos;
create trigger medicamentos_autoria before insert or update on public.medicamentos
  for each row execute function public.medicamentos_autoria();
drop trigger if exists medicamentos_correccion on public.medicamentos;
create trigger medicamentos_correccion after update on public.medicamentos
  for each row execute function public.registrar_correccion();

drop policy if exists medicamentos_alta on public.medicamentos;
drop policy if exists medicamentos_cambio on public.medicamentos;
create policy medicamentos_alta on public.medicamentos for insert to authenticated with check (public.tiene_acceso());
create policy medicamentos_cambio on public.medicamentos for update to authenticated using (public.tiene_acceso()) with check (public.tiene_acceso());

-- ---------- 4. Lechones destetados que se quedan unos días en su paridera
--               (estancias «Paridera 1-1» … «Paridera 3-6»: sala-paridera)
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.mov_grupos'::regclass and contype = 'c'
             and (pg_get_constraintdef(oid) like '%origen ~%' or pg_get_constraintdef(oid) like '%destino ~%') loop
    execute format('alter table public.mov_grupos drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.mov_grupos add constraint mov_grupos_origen_check
  check (origen ~ '^(Lechonera [1-4]|Cebadero ([1-9]|1[0-9]|2[0-4])|Paridera [1-3]-[1-6])$');
alter table public.mov_grupos add constraint mov_grupos_destino_check
  check (destino ~ '^(Lechonera [1-4]|Cebadero ([1-9]|1[0-9]|2[0-4])|Paridera [1-3]-[1-6])$');

-- ---------- 5. Verracos: crotal principal y otros crotales (como las cerdas)
alter table public.verracos add column if not exists otros_crotales text[] not null default '{}';
