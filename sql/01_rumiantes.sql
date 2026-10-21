-- =====================================================================
-- CIFEAFARM · CIFEARUMI (cabras y ovejas) · V1: corralinas, censo y fichas
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible.
--
-- Va en el MISMO proyecto de Supabase que CIFEAPORC: usa sus perfiles
-- (alias, PIN, curso) y sus funciones es_profesor(), tiene_acceso() y
-- mi_granja() (en CIFEAPORC, "granja" = curso del alumno).
-- No modifica ninguna tabla de CIFEAPORC.
-- =====================================================================

-- ---------- Corralinas ----------------------------------------------------
create table if not exists public.rum_corralinas (
  id      smallint primary key,
  nave    text not null,
  numero  smallint not null,
  uso     text,                                  -- texto libre: "Chivas", "Machos"…
  activa  boolean not null default true,
  unique (nave, numero)
);
insert into public.rum_corralinas (id, nave, numero) values
  (1, 'Cría y Ordeño', 1), (2, 'Cría y Ordeño', 2), (3, 'Cría y Ordeño', 3),
  (11, 'Machos y Ovejas', 1), (12, 'Machos y Ovejas', 2), (13, 'Machos y Ovejas', 3),
  (14, 'Machos y Ovejas', 4), (15, 'Machos y Ovejas', 5), (16, 'Machos y Ovejas', 6),
  (17, 'Machos y Ovejas', 7)
on conflict (id) do nothing;

-- ---------- Animales (censo común a los dos cursos) -------------------------
create table if not exists public.rum_animales (
  id               uuid primary key default gen_random_uuid(),
  especie          text not null check (especie in ('caprino','ovino')),
  categoria        text not null check (categoria in
                     ('cabra','chiva','macho_cabrio','cabrito','oveja','cordera','morueco','cordero')),
  sexo             text check (sexo in ('hembra','macho')),
  crotal           text,                         -- crotal oficial
  manejo           text,                         -- nº del collar (se reutiliza tras una baja)
  codigo_cria      text,                         -- crías sin crotal: nº de la madre + orden (A12-1)
  capa             text check (capa in ('negra','caoba','bicolor')),
  fecha_nacimiento date,
  anio_nacimiento  smallint check (anio_nacimiento between 1990 and 2100),
  madre_id         uuid references public.rum_animales(id) on delete set null,
  padre_id         uuid references public.rum_animales(id) on delete set null,
  madre_txt        text,                         -- madre que ya no está en el censo
  padre_txt        text,
  origen           text check (origen in ('centro','compra','desconocido')),
  corralina_id     smallint references public.rum_corralinas(id),  -- dónde entró; los traslados van en rum_eventos
  fecha_alta       date not null default current_date,
  motivo_alta      text,
  fecha_baja       date,
  causa_baja       text,
  destino_baja     text,
  obs              text,
  importado        boolean not null default false,
  alta_autor       uuid,
  alta_por         text,
  baja_por         text,
  creado           timestamptz not null default now(),
  modificado       timestamptz,
  modificado_por   text,
  check ((especie = 'caprino' and categoria in ('cabra','chiva','macho_cabrio','cabrito'))
      or (especie = 'ovino'   and categoria in ('oveja','cordera','morueco','cordero'))),
  check (sexo is null
      or (categoria in ('cabra','chiva','oveja','cordera') and sexo = 'hembra')
      or (categoria in ('macho_cabrio','morueco') and sexo = 'macho')
      or categoria in ('cabrito','cordero')),
  check (capa is null or especie = 'caprino'),
  check (crotal is not null or manejo is not null or categoria in ('cabrito','cordero')),
  check (categoria not in ('cabrito','cordero') or madre_id is not null or madre_txt is not null),
  check (fecha_baja is null or causa_baja is not null)
);
create unique index if not exists rum_animales_crotal on public.rum_animales (crotal) where crotal is not null;
-- Un nº de collar no puede estar en dos animales vivos de la misma especie a la vez.
create unique index if not exists rum_animales_manejo on public.rum_animales (especie, upper(manejo))
  where manejo is not null and fecha_baja is null;
create index if not exists rum_animales_madre on public.rum_animales (madre_id);

-- ---------- Eventos (historial de cada animal) ------------------------------
-- Los alumnos registran traslados y notas (más adelante: reproducción y sanidad).
-- La base de datos añade sola las altas, bajas y cambios de datos.
create table if not exists public.rum_eventos (
  id             uuid primary key default gen_random_uuid(),
  animal_id      uuid not null references public.rum_animales(id) on delete cascade,
  tipo           text not null check (tipo in
                   ('alta','baja','baja_anulada','datos',               -- automáticos
                    'traslado','nota',                                   -- V1
                    'entrada_macho','salida_macho','eco','parto','encalostrado',
                    'inicio_ordeno','destete','acrotalado','secado',     -- V2
                    'condicion','lechero','manejo_diario')),             -- V4
  fecha          date not null,
  estado         text not null default 'realizado' check (estado in ('previsto','realizado')),
  datos          jsonb not null default '{}'::jsonb,
  curso          smallint,                       -- curso de quien lo registró (vacío = profesor)
  autor          uuid references auth.users(id) on delete set null,
  autor_alias    text,
  creado         timestamptz not null default now(),
  modificado     timestamptz,
  modificado_por text,
  realizado_por  text                            -- quien valida un previsto
);
create index if not exists rum_eventos_animal on public.rum_eventos (animal_id, fecha, creado);
create index if not exists rum_eventos_creado on public.rum_eventos (creado desc);

-- ---------- Autoría de los eventos (la pone la base de datos) ---------------
create or replace function public.rum_eventos_autoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text; g smallint;
begin
  select alias, granja_id into a, g from perfiles where user_id = auth.uid();
  if tg_op = 'INSERT' then
    new.autor := auth.uid(); new.autor_alias := coalesce(a, new.autor_alias);
    new.curso := g; new.creado := now();
    new.modificado := null; new.modificado_por := null;
  else
    new.autor := old.autor; new.autor_alias := old.autor_alias; new.curso := old.curso;
    new.creado := old.creado; new.animal_id := old.animal_id;
    new.modificado := now(); new.modificado_por := a;
  end if;
  return new;
end $$;
drop trigger if exists rum_eventos_autoria on public.rum_eventos;
create trigger rum_eventos_autoria before insert or update on public.rum_eventos
  for each row execute function public.rum_eventos_autoria();

-- ---------- Control del censo ------------------------------------------------
-- Cualquiera da altas y bajas. Los datos de un animal solo los cambia el
-- profesor (o el alumno que lo dio de alta, durante 24 h). Anular una baja: profesor.
create or replace function public.rum_animales_control() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text; prof boolean; n integer; base text;
  libres text[] := array['fecha_baja','causa_baja','destino_baja','baja_por','modificado','modificado_por'];
begin
  select alias into a from perfiles where user_id = auth.uid();
  prof := auth.uid() is null or es_profesor();          -- sin usuario = SQL Editor
  if new.crotal is not null then new.crotal := nullif(upper(regexp_replace(new.crotal, '\s', '', 'g')), ''); end if;
  if new.manejo is not null then new.manejo := nullif(upper(trim(new.manejo)), ''); end if;
  if tg_op = 'INSERT' then
    new.alta_autor := auth.uid(); new.alta_por := a; new.creado := now();
    new.baja_por := case when new.fecha_baja is not null then a end;
    new.modificado := null; new.modificado_por := null;
    if not prof then new.importado := false; end if;
    -- Código provisional de las crías: nº de manejo de la madre + orden de nacimiento
    if new.categoria in ('cabrito','cordero') and new.crotal is null and new.codigo_cria is null then
      if new.madre_id is not null then
        select coalesce(manejo, codigo_cria, crotal) into base from rum_animales where id = new.madre_id;
        select count(*) into n from rum_animales where madre_id = new.madre_id;
      else
        base := new.madre_txt;
        select count(*) into n from rum_animales where madre_id is null and madre_txt = new.madre_txt;
      end if;
      new.codigo_cria := coalesce(base, '?') || '-' || (n + 1);
    end if;
    return new;
  end if;
  new.alta_autor := old.alta_autor; new.alta_por := old.alta_por; new.creado := old.creado; new.importado := old.importado;
  if not prof and not (old.alta_autor = auth.uid() and old.creado > now() - interval '24 hours') then
    if (to_jsonb(new) - libres) is distinct from (to_jsonb(old) - libres) then
      raise exception 'Solo el profesor puede cambiar los datos de un animal. Tú puedes trasladarlo o darlo de baja.';
    end if;
    if old.fecha_baja is not null and (new.fecha_baja is distinct from old.fecha_baja
        or new.causa_baja is distinct from old.causa_baja or new.destino_baja is distinct from old.destino_baja) then
      raise exception 'Solo el profesor puede anular o corregir una baja.';
    end if;
  end if;
  if old.fecha_baja is null and new.fecha_baja is not null then new.baja_por := a;
  elsif new.fecha_baja is null then new.baja_por := null; new.causa_baja := null; new.destino_baja := null;
  else new.baja_por := old.baja_por; end if;
  new.modificado := now(); new.modificado_por := a;
  return new;
end $$;

-- Deja en el historial las altas, bajas y cambios de datos.
create or replace function public.rum_animales_registro() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text; g smallint; cambios jsonb := '{}'::jsonb; k text;
  vigilar text[] := array['especie','categoria','sexo','crotal','manejo','codigo_cria','capa','fecha_nacimiento',
                          'anio_nacimiento','madre_id','padre_id','madre_txt','padre_txt','origen','corralina_id','fecha_alta','obs'];
begin
  select alias, granja_id into a, g from perfiles where user_id = auth.uid();
  if tg_op = 'INSERT' then
    insert into rum_eventos (animal_id, tipo, fecha, datos, curso, autor, autor_alias)
      values (new.id, 'alta', new.fecha_alta,
              jsonb_build_object('motivo', new.motivo_alta, 'importado', new.importado), g, auth.uid(), a);
    if new.fecha_baja is not null then
      insert into rum_eventos (animal_id, tipo, fecha, datos, curso, autor, autor_alias)
        values (new.id, 'baja', new.fecha_baja, jsonb_build_object('causa', new.causa_baja, 'destino', new.destino_baja), g, auth.uid(), a);
    end if;
    return null;
  end if;
  if old.fecha_baja is null and new.fecha_baja is not null then
    insert into rum_eventos (animal_id, tipo, fecha, datos, curso, autor, autor_alias)
      values (new.id, 'baja', new.fecha_baja, jsonb_build_object('causa', new.causa_baja, 'destino', new.destino_baja), g, auth.uid(), a);
  elsif old.fecha_baja is not null and new.fecha_baja is null then
    insert into rum_eventos (animal_id, tipo, fecha, datos, curso, autor, autor_alias)
      values (new.id, 'baja_anulada', current_date, jsonb_build_object('causa', old.causa_baja), g, auth.uid(), a);
  end if;
  foreach k in array vigilar loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      cambios := cambios || jsonb_build_object(k, jsonb_build_array(to_jsonb(old) -> k, to_jsonb(new) -> k));
    end if;
  end loop;
  if cambios <> '{}'::jsonb then
    insert into rum_eventos (animal_id, tipo, fecha, datos, curso, autor, autor_alias)
      values (new.id, 'datos', current_date, jsonb_build_object('cambios', cambios), g, auth.uid(), a);
  end if;
  return null;
end $$;

drop trigger if exists rum_animales_control on public.rum_animales;
drop trigger if exists rum_animales_registro on public.rum_animales;
create trigger rum_animales_control before insert or update on public.rum_animales
  for each row execute function public.rum_animales_control();
create trigger rum_animales_registro after insert or update on public.rum_animales
  for each row execute function public.rum_animales_registro();

-- ---------- Reglas de acceso (RLS) --------------------------------------------
-- Una sola granja real: todos los usuarios activos ven todo.
alter table public.rum_corralinas enable row level security;
alter table public.rum_animales   enable row level security;
alter table public.rum_eventos    enable row level security;

drop policy if exists rum_corralinas_ver on public.rum_corralinas;
drop policy if exists rum_corralinas_alta on public.rum_corralinas;
drop policy if exists rum_corralinas_cambio on public.rum_corralinas;
create policy rum_corralinas_ver on public.rum_corralinas for select to authenticated using (public.tiene_acceso());
create policy rum_corralinas_alta on public.rum_corralinas for insert to authenticated with check (public.es_profesor());
create policy rum_corralinas_cambio on public.rum_corralinas for update to authenticated
  using (public.es_profesor()) with check (public.es_profesor());

drop policy if exists rum_animales_ver on public.rum_animales;
drop policy if exists rum_animales_alta on public.rum_animales;
drop policy if exists rum_animales_cambio on public.rum_animales;
drop policy if exists rum_animales_borrado on public.rum_animales;
create policy rum_animales_ver on public.rum_animales for select to authenticated using (public.tiene_acceso());
create policy rum_animales_alta on public.rum_animales for insert to authenticated with check (public.tiene_acceso());
create policy rum_animales_cambio on public.rum_animales for update to authenticated
  using (public.tiene_acceso()) with check (public.tiene_acceso());
-- Borrar un animal (por ejemplo, un error al importar) borra su historial: solo el profesor.
create policy rum_animales_borrado on public.rum_animales for delete to authenticated using (public.es_profesor());

drop policy if exists rum_eventos_ver on public.rum_eventos;
drop policy if exists rum_eventos_alta on public.rum_eventos;
drop policy if exists rum_eventos_cambio on public.rum_eventos;
drop policy if exists rum_eventos_borrado on public.rum_eventos;
create policy rum_eventos_ver on public.rum_eventos for select to authenticated using (public.tiene_acceso());
create policy rum_eventos_alta on public.rum_eventos for insert to authenticated
  with check (public.tiene_acceso() and tipo not in ('alta','baja','baja_anulada','datos'));
-- Como en CIFEAPORC: el alumno corrige o borra lo suyo durante 24 h; después, solo el profesor.
create policy rum_eventos_cambio on public.rum_eventos for update to authenticated
  using (public.es_profesor()
         or (autor = auth.uid() and creado > now() - interval '24 hours'
             and tipo not in ('alta','baja','baja_anulada','datos')))
  with check (public.tiene_acceso());
create policy rum_eventos_borrado on public.rum_eventos for delete to authenticated
  using (public.es_profesor()
         or (autor = auth.uid() and creado > now() - interval '24 hours'
             and tipo not in ('alta','baja','baja_anulada','datos')));

-- ---------- Importar el censo desde el Excel (solo profesor) -----------------
-- Recibe una lista de animales ya normalizada por la app. Lo hace todo o nada.
-- Madre y padre llegan como nº de manejo: se enlazan si están en el censo;
-- si no, se guardan como texto. Las crías se insertan al final para enlazar a su madre.
create or replace function public.rum_importar(filas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare f jsonb; n integer := 0; m uuid; p uuid; vuelta integer;
begin
  if not es_profesor() then raise exception 'Solo el profesor puede importar el censo'; end if;
  for vuelta in 1..2 loop
    for f in select * from jsonb_array_elements(filas) loop
      continue when (f->>'categoria' in ('cabrito','cordero')) <> (vuelta = 2);
      m := null; p := null;
      if coalesce(f->>'madre', '') <> '' then
        select id into m from rum_animales where especie = f->>'especie' and fecha_baja is null
          and upper(manejo) = upper(f->>'madre') limit 1;
      end if;
      if coalesce(f->>'padre', '') <> '' then
        select id into p from rum_animales where especie = f->>'especie' and fecha_baja is null
          and upper(manejo) = upper(f->>'padre') limit 1;
      end if;
      insert into rum_animales (especie, categoria, sexo, crotal, manejo, capa, fecha_nacimiento, anio_nacimiento,
                                madre_id, padre_id, madre_txt, padre_txt, origen, corralina_id, fecha_alta,
                                motivo_alta, obs, importado)
      values (f->>'especie', f->>'categoria', nullif(f->>'sexo', ''), nullif(f->>'crotal', ''), nullif(f->>'manejo', ''),
              nullif(f->>'capa', ''), nullif(f->>'fecha_nacimiento', '')::date, nullif(f->>'anio_nacimiento', '')::smallint,
              m, p, case when m is null then nullif(f->>'madre', '') end, case when p is null then nullif(f->>'padre', '') end,
              nullif(f->>'origen', ''), nullif(f->>'corralina_id', '')::smallint,
              coalesce(nullif(f->>'fecha_alta', '')::date, current_date), 'Censo inicial', nullif(f->>'obs', ''), true);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.rum_importar(jsonb) from public, anon;
grant execute on function public.rum_importar(jsonb) to authenticated;
