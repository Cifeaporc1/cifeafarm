-- =====================================================================
-- CIFEAFARM · Unir productos repetidos del catálogo
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible:
-- se puede ejecutar varias veces y no borra ningún dato al ejecutarlo.
--
-- Crea la función que usa la app (Sanidad → Productos → Productos repetidos):
-- · Conserva un producto y le completa los datos vacíos con los de los repetidos.
-- · Los tratamientos de las dos granjas que usaban un repetido pasan al conservado.
-- · Borra los repetidos, pero antes guarda una copia en «medicamentos_unidos».
-- Solo la pueden usar el profesor y la veterinaria.
-- =====================================================================

create table if not exists public.medicamentos_unidos (
  id          uuid primary key,          -- id del producto borrado
  unido_en    uuid,                      -- producto que se conserva
  datos       jsonb not null,            -- el producto borrado, entero
  unido_por   text,
  unido_fecha timestamptz not null default now()
);
alter table public.medicamentos_unidos enable row level security;
drop policy if exists medicamentos_unidos_ver on public.medicamentos_unidos;
create policy medicamentos_unidos_ver on public.medicamentos_unidos for select to authenticated using (public.es_profesor());

create or replace function public.unir_medicamentos(conservar uuid, otros uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  a text; m record; n integer := 0; k integer;
  quita uuid[] := array(select x from unnest(otros) x where x is not null and x <> conservar);
begin
  if not public.es_profesor() then raise exception 'Solo el profesor o la veterinaria pueden unir productos'; end if;
  if not exists (select 1 from medicamentos where id = conservar) then raise exception 'El producto que se conserva no existe'; end if;
  if coalesce(cardinality(quita), 0) = 0 then return 0; end if;
  select alias into a from perfiles where user_id = auth.uid();

  -- 1. Completar los datos vacíos del que se conserva (en el orden recibido)
  for m in select x.* from unnest(quita) with ordinality u(id, o) join medicamentos x on x.id = u.id order by u.o loop
    update medicamentos c set
      materia_activa   = coalesce(nullif(trim(c.materia_activa), ''), m.materia_activa),
      tipo             = coalesce(c.tipo, m.tipo),
      presentacion     = coalesce(nullif(trim(c.presentacion), ''), m.presentacion),
      dosis            = coalesce(nullif(trim(c.dosis), ''), m.dosis),
      via              = coalesce(nullif(trim(c.via), ''), m.via),
      supresion_dias   = coalesce(c.supresion_dias, m.supresion_dias),
      lote             = coalesce(nullif(trim(c.lote), ''), m.lote),
      caducidad        = coalesce(c.caducidad, m.caducidad),
      ficha_url        = coalesce(nullif(trim(c.ficha_url), ''), m.ficha_url),
      notas            = case when nullif(trim(c.notas), '') is null then m.notas
                              when nullif(trim(m.notas), '') is null or position(m.notas in c.notas) > 0 then c.notas
                              else c.notas || E'\n' || m.notas end,
      espera_carne_rum = coalesce(c.espera_carne_rum, m.espera_carne_rum),
      espera_leche_rum = coalesce(c.espera_leche_rum, m.espera_leche_rum),
      especies         = array(select distinct e from unnest(coalesce(c.especies, '{}') || coalesce(m.especies, '{}')) e where e is not null),
      clases           = array(select distinct e from unnest(coalesce(c.clases, '{}') || coalesce(m.clases, '{}')) e where e is not null),
      posologia        = coalesce(m.posologia, '{}'::jsonb) || coalesce(c.posologia, '{}'::jsonb),
      activo           = c.activo or m.activo
    where c.id = conservar;
  end loop;

  -- 2. Los tratamientos pasan al que se conserva (sin marcarlos como corregidos)
  if to_regclass('public.rum_sanidad') is not null then
    alter table public.rum_sanidad disable trigger user;
    update public.rum_sanidad set medicamento_id = conservar where medicamento_id = any(quita);
    get diagnostics k = row_count; n := n + k;
    alter table public.rum_sanidad enable trigger user;
  end if;
  if to_regclass('public.sanidad') is not null then
    alter table public.sanidad disable trigger user;
    update public.sanidad set medicamento_id = conservar where medicamento_id = any(quita);
    get diagnostics k = row_count; n := n + k;
    alter table public.sanidad enable trigger user;
  end if;

  -- 3. Copia de los repetidos y borrado
  insert into medicamentos_unidos (id, unido_en, datos, unido_por)
    select x.id, conservar, to_jsonb(x), a from medicamentos x where x.id = any(quita)
  on conflict (id) do nothing;
  delete from medicamentos where id = any(quita);
  return n;
end $$;
revoke all on function public.unir_medicamentos(uuid, uuid[]) from public, anon;
grant execute on function public.unir_medicamentos(uuid, uuid[]) to authenticated;
