-- =====================================================================
-- CIFEAFARM · CIFEARUMI (cabras y ovejas): corralinas, censo, fichas (V1)
--            y reproducción: lotes, ecografías, partos, crías, ordeño y secado (V2)
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
-- Raza (añadida en 0.1.3). Vacía = la de la especie: murciano-granadina o segureña.
alter table public.rum_animales add column if not exists raza text;
-- Peso al nacer de las crías, en kg (V2).
alter table public.rum_animales add column if not exists peso_nacimiento numeric(5,2) check (peso_nacimiento > 0 and peso_nacimiento < 20);
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
  -- sin usuario = SQL Editor; rum.sistema = cambios que hace la propia base de datos (parto, acrotalado)
  prof := auth.uid() is null or es_profesor() or coalesce(current_setting('rum.sistema', true), '') = 'on';
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
                          'anio_nacimiento','madre_id','padre_id','madre_txt','padre_txt','origen','corralina_id','fecha_alta','obs','raza','peso_nacimiento'];
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
create policy rum_animales_borrado on public.rum_animales for delete to authenticated
  using (exists (select 1 from public.perfiles where user_id = auth.uid() and rol in ('profesor', 'veterinario') and activo));

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
             and tipo not in ('alta','baja','baja_anulada','datos','parto','acrotalado')))
  with check (public.tiene_acceso());
create policy rum_eventos_borrado on public.rum_eventos for delete to authenticated
  using (public.es_profesor()
         or (autor = auth.uid() and creado > now() - interval '24 hours'
             and tipo not in ('alta','baja','baja_anulada','datos','parto','acrotalado')));

-- ---------- Importar el censo desde el Excel (solo profesor) -----------------
-- Recibe una lista de animales ya normalizada por la app. Lo hace todo o nada.
-- Madre y padre llegan como nº de manejo: se enlazan si están en el censo;
-- si no, se guardan como texto. Las crías se insertan al final para enlazar a su madre.
create or replace function public.rum_importar(filas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare f jsonb; n integer := 0; m uuid; p uuid; vuelta integer;
begin
  if not exists (select 1 from perfiles where user_id = auth.uid() and rol in ('profesor', 'veterinario') and activo) then
    raise exception 'Solo el profesor o la veterinaria pueden importar el censo'; end if;
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

-- =====================================================================
-- V2 · REPRODUCCIÓN
-- =====================================================================

-- ---------- Lotes de cubrición (monta natural, machos asignados al lote) ----
-- El macho va a la corralina de las hembras (traslado) y vuelve al sacarlo.
create table if not exists public.rum_lotes (
  id             uuid primary key default gen_random_uuid(),
  especie        text not null check (especie in ('caprino','ovino')),
  nombre         text not null,
  corralina_id   smallint references public.rum_corralinas(id),
  machos         uuid[] not null default '{}',
  hembras        uuid[] not null default '{}',
  fecha_entrada  date not null,
  fecha_salida   date,
  obs            text,
  autor          uuid references auth.users(id) on delete set null,
  autor_alias    text,
  curso          smallint,
  creado         timestamptz not null default now(),
  modificado     timestamptz,
  modificado_por text,
  check (fecha_salida is null or fecha_salida >= fecha_entrada)
);
create or replace function public.rum_lotes_autoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text; g smallint;
begin
  select alias, granja_id into a, g from perfiles where user_id = auth.uid();
  if tg_op = 'INSERT' then
    new.autor := auth.uid(); new.autor_alias := a; new.curso := g; new.creado := now(); new.modificado := null; new.modificado_por := null;
  else
    new.autor := old.autor; new.autor_alias := old.autor_alias; new.curso := old.curso; new.creado := old.creado;
    new.modificado := now(); new.modificado_por := a;
  end if;
  return new;
end $$;
drop trigger if exists rum_lotes_autoria on public.rum_lotes;
create trigger rum_lotes_autoria before insert or update on public.rum_lotes
  for each row execute function public.rum_lotes_autoria();

alter table public.rum_lotes enable row level security;
drop policy if exists rum_lotes_ver on public.rum_lotes;
drop policy if exists rum_lotes_alta on public.rum_lotes;
drop policy if exists rum_lotes_cambio on public.rum_lotes;
drop policy if exists rum_lotes_borrado on public.rum_lotes;
create policy rum_lotes_ver on public.rum_lotes for select to authenticated using (public.tiene_acceso());
create policy rum_lotes_alta on public.rum_lotes for insert to authenticated with check (public.tiene_acceso());
-- Sacar el macho lo hace cualquiera (otro día, otro alumno).
create policy rum_lotes_cambio on public.rum_lotes for update to authenticated
  using (public.tiene_acceso()) with check (public.tiene_acceso());
create policy rum_lotes_borrado on public.rum_lotes for delete to authenticated
  using (public.es_profesor() or (autor = auth.uid() and creado > now() - interval '24 hours'));

-- ---------- Parto: registra el parto, da de alta las crías vivas y, si es el
-- primer parto de una chiva o cordera, la pasa a cabra u oveja.
-- crias = [{"sexo":"hembra","viva":true,"peso":3.2}, …]; existentes = ids de crías ya dadas de alta.
create or replace function public.rum_parto(p_madre uuid, p_fecha date, p_datos jsonb, p_crias jsonb,
                                            p_corralina smallint, p_padre uuid, p_existentes uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare m rum_animales; c jsonb; nueva uuid; ids uuid[] := '{}'; ev uuid; prom jsonb := null; vivas int := 0; muertas int := 0;
begin
  if not tiene_acceso() then raise exception 'Sin acceso'; end if;
  select * into m from rum_animales where id = p_madre;
  if m.id is null or m.fecha_baja is not null then raise exception 'La madre no está en el censo'; end if;
  if m.categoria not in ('cabra','chiva','oveja','cordera') then raise exception 'Solo paren cabras, chivas, ovejas y corderas'; end if;
  if p_fecha > current_date then raise exception 'La fecha del parto no puede ser futura'; end if;
  perform set_config('rum.sistema', 'on', true);
  for c in select * from jsonb_array_elements(coalesce(p_crias, '[]'::jsonb)) loop
    if coalesce((c->>'viva')::boolean, true) then
      insert into rum_animales (especie, categoria, sexo, fecha_nacimiento, madre_id, padre_id, origen, corralina_id,
                                fecha_alta, motivo_alta, peso_nacimiento, raza)
      values (m.especie, case when m.especie = 'caprino' then 'cabrito' else 'cordero' end, nullif(c->>'sexo', ''),
              p_fecha, m.id, p_padre, 'centro', p_corralina, p_fecha, 'Nacimiento', nullif(c->>'peso', '')::numeric,
              case when m.raza is not null then m.raza end)
      returning id into nueva;
      ids := ids || nueva; vivas := vivas + 1;
    else muertas := muertas + 1; end if;
  end loop;
  ids := ids || coalesce(p_existentes, '{}');
  vivas := vivas + coalesce(array_length(p_existentes, 1), 0);
  if m.categoria in ('chiva','cordera') then
    prom := jsonb_build_object('de', m.categoria, 'a', case when m.categoria = 'chiva' then 'cabra' else 'oveja' end);
    update rum_animales set categoria = prom->>'a' where id = m.id;
  end if;
  insert into rum_eventos (animal_id, tipo, fecha, datos)
  values (m.id, 'parto', p_fecha, coalesce(p_datos, '{}'::jsonb) || jsonb_build_object(
            'crias', to_jsonb(ids), 'vivas', vivas, 'muertas', muertas, 'detalle', coalesce(p_crias, '[]'::jsonb),
            'padre', p_padre, 'promocion', prom))
  returning id into ev;
  perform set_config('rum.sistema', 'off', true);
  return ev;
end $$;
revoke all on function public.rum_parto(uuid, date, jsonb, jsonb, smallint, uuid, uuid[]) from public, anon;
grant execute on function public.rum_parto(uuid, date, jsonb, jsonb, smallint, uuid, uuid[]) to authenticated;

-- Borrar un parto mal registrado (solo profesor): borra el registro y las crías que creó
-- (no las que ya existían) y deshace el paso de chiva a cabra.
create or replace function public.rum_borrar_parto(p_evento uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e rum_eventos; x uuid;
begin
  if not es_profesor() then raise exception 'Solo el profesor puede borrar un parto'; end if;
  select * into e from rum_eventos where id = p_evento and tipo = 'parto';
  if e.id is null then raise exception 'No existe ese parto'; end if;
  for x in select (jsonb_array_elements_text(coalesce(e.datos->'crias', '[]'::jsonb)))::uuid loop
    delete from rum_animales where id = x and madre_id = e.animal_id and fecha_alta = e.fecha and motivo_alta = 'Nacimiento'
      and not exists (select 1 from rum_eventos y where y.animal_id = x and y.tipo in ('acrotalado'));
  end loop;
  if e.datos->'promocion' is not null and jsonb_typeof(e.datos->'promocion') = 'object' then
    update rum_animales set categoria = e.datos->'promocion'->>'de' where id = e.animal_id and categoria = e.datos->'promocion'->>'a';
  end if;
  delete from rum_eventos where id = e.id;
end $$;
revoke all on function public.rum_borrar_parto(uuid) from public, anon;
grant execute on function public.rum_borrar_parto(uuid) to authenticated;

-- ---------- Acrotalado: la cría que se queda recibe crotal y collar y pasa a reposición
-- (hembras: chiva o cordera; machos: macho cabrío o morueco). Lo hace cualquiera.
create or replace function public.rum_acrotalar(p_cria uuid, p_fecha date, p_crotal text, p_manejo text)
returns void language plpgsql security definer set search_path = public as $$
declare c rum_animales; cat text;
begin
  if not tiene_acceso() then raise exception 'Sin acceso'; end if;
  select * into c from rum_animales where id = p_cria;
  if c.id is null or c.fecha_baja is not null then raise exception 'Esa cría no está en el censo'; end if;
  if c.categoria not in ('cabrito','cordero') then raise exception 'Solo se acrotalan cabritos y corderos'; end if;
  if c.sexo is null then raise exception 'Anota antes el sexo de la cría'; end if;
  if coalesce(trim(p_crotal), '') = '' then raise exception 'Falta el crotal'; end if;
  cat := case when c.especie = 'caprino' then (case when c.sexo = 'hembra' then 'chiva' else 'macho_cabrio' end)
              else (case when c.sexo = 'hembra' then 'cordera' else 'morueco' end) end;
  perform set_config('rum.sistema', 'on', true);
  update rum_animales set crotal = p_crotal, manejo = nullif(trim(p_manejo), ''), categoria = cat where id = c.id;
  insert into rum_eventos (animal_id, tipo, fecha, datos)
  values (c.id, 'acrotalado', p_fecha, jsonb_build_object('crotal', upper(p_crotal), 'manejo', upper(nullif(trim(p_manejo), '')), 'categoria', cat, 'codigo', c.codigo_cria));
  perform set_config('rum.sistema', 'off', true);
end $$;
revoke all on function public.rum_acrotalar(uuid, date, text, text) from public, anon;
grant execute on function public.rum_acrotalar(uuid, date, text, text) to authenticated;

-- =====================================================================
-- V3 · SANIDAD
-- =====================================================================

-- ---------- Catálogo de medicamentos: el de CIFEAPORC, común a las dos granjas.
-- Se añaden los tiempos de espera para pequeños rumiantes y para qué especies sirve.
alter table public.medicamentos add column if not exists espera_carne_rum integer check (espera_carne_rum >= 0);
alter table public.medicamentos add column if not exists espera_leche_rum integer check (espera_leche_rum >= 0);
alter table public.medicamentos add column if not exists especies text[];
update public.medicamentos set especies = '{porcino}' where especies is null;   -- los de CIFEAPORC

-- ---------- Tratamientos, vacunas y desparasitaciones: previstos y realizados
create table if not exists public.rum_sanidad (
  id              uuid primary key default gen_random_uuid(),
  estado          text not null check (estado in ('previsto','realizado')),
  tipo            text not null check (tipo in ('vacunacion','desparasitacion','tratamiento','vitaminas','pezunas','otro')),
  fecha           date not null,                 -- prevista o realizada (primer día)
  ambito          text not null check (ambito in ('animales','corralina','especie','granja')),
  animales        uuid[] not null default '{}',  -- tratados (al realizarlo, los presentes en la corralina o especie)
  corralina_id    smallint references public.rum_corralinas(id),
  especie         text check (especie in ('caprino','ovino')),
  medicamento_id  uuid references public.medicamentos(id) on delete set null,
  producto        text,
  dosis           text,
  via             text,
  lote            text,
  caducidad       date,
  duracion_dias   integer not null default 1 check (duracion_dias between 1 and 60),
  espera_carne    integer check (espera_carne >= 0),
  espera_leche    integer check (espera_leche >= 0),
  carne_hasta     date,                          -- la calcula la base de datos
  leche_hasta     date,
  motivo          text,
  veterinario     text,
  repetir_dias    integer check (repetir_dias > 0),
  obs             text,
  autor           uuid references auth.users(id) on delete set null,
  autor_alias     text,
  curso           smallint,
  realizado_por   text,
  creado          timestamptz not null default now(),
  modificado      timestamptz,
  modificado_por  text
);
create index if not exists rum_sanidad_fecha on public.rum_sanidad (estado, fecha);

-- Autoría, quién lo valida y fechas de retirada (último día de tratamiento + tiempo de espera).
create or replace function public.rum_sanidad_autoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text; g smallint; fin date;
begin
  select alias, granja_id into a, g from perfiles where user_id = auth.uid();
  if tg_op = 'INSERT' then
    new.autor := auth.uid(); new.autor_alias := a; new.curso := g; new.creado := now();
    new.modificado := null; new.modificado_por := null;
    new.realizado_por := case when new.estado = 'realizado' then a end;
  else
    new.autor := old.autor; new.autor_alias := old.autor_alias; new.curso := old.curso; new.creado := old.creado;
    new.modificado := now(); new.modificado_por := a;
    if old.estado = 'previsto' and new.estado = 'realizado' then new.realizado_por := a;
    else new.realizado_por := old.realizado_por; end if;
  end if;
  fin := new.fecha + (new.duracion_dias - 1);
  new.carne_hasta := case when new.estado = 'realizado' and coalesce(new.espera_carne, 0) > 0 then fin + new.espera_carne end;
  new.leche_hasta := case when new.estado = 'realizado' and coalesce(new.espera_leche, 0) > 0 then fin + new.espera_leche end;
  return new;
end $$;
drop trigger if exists rum_sanidad_autoria on public.rum_sanidad;
create trigger rum_sanidad_autoria before insert or update on public.rum_sanidad
  for each row execute function public.rum_sanidad_autoria();

alter table public.rum_sanidad enable row level security;
drop policy if exists rum_sanidad_ver on public.rum_sanidad;
drop policy if exists rum_sanidad_alta on public.rum_sanidad;
drop policy if exists rum_sanidad_cambio on public.rum_sanidad;
drop policy if exists rum_sanidad_borrado on public.rum_sanidad;
create policy rum_sanidad_ver on public.rum_sanidad for select to authenticated using (public.tiene_acceso());
create policy rum_sanidad_alta on public.rum_sanidad for insert to authenticated with check (public.tiene_acceso());
-- Un previsto lo valida cualquiera (profesor o alumno); lo realizado, como siempre: el autor 24 h o el profesor.
create policy rum_sanidad_cambio on public.rum_sanidad for update to authenticated
  using (public.es_profesor() or estado = 'previsto' or (autor = auth.uid() and creado > now() - interval '24 hours'))
  with check (public.tiene_acceso());
create policy rum_sanidad_borrado on public.rum_sanidad for delete to authenticated
  using (public.es_profesor() or (autor = auth.uid() and creado > now() - interval '24 hours'));

-- =====================================================================
-- V4 · MANEJO DIARIO Y SEGUIMIENTO
-- (condición corporal, FAMACHA y control lechero van en rum_eventos:
--  tipos 'condicion' y 'lechero')
-- =====================================================================
create table if not exists public.rum_manejo (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null,
  corralinas     smallint[] not null default '{}',
  tareas         text[] not null default '{}',   -- limpieza, alimentacion, agua, cama, ordeno, otra
  detalle        text,                           -- ración, observaciones…
  participantes  text,                           -- alumnos que lo hicieron
  autor          uuid references auth.users(id) on delete set null,
  autor_alias    text,
  curso          smallint,
  creado         timestamptz not null default now(),
  modificado     timestamptz,
  modificado_por text
);
create index if not exists rum_manejo_fecha on public.rum_manejo (fecha desc);
drop trigger if exists rum_manejo_autoria on public.rum_manejo;
create trigger rum_manejo_autoria before insert or update on public.rum_manejo
  for each row execute function public.rum_lotes_autoria();

alter table public.rum_manejo enable row level security;
drop policy if exists rum_manejo_ver on public.rum_manejo;
drop policy if exists rum_manejo_alta on public.rum_manejo;
drop policy if exists rum_manejo_cambio on public.rum_manejo;
drop policy if exists rum_manejo_borrado on public.rum_manejo;
create policy rum_manejo_ver on public.rum_manejo for select to authenticated using (public.tiene_acceso());
create policy rum_manejo_alta on public.rum_manejo for insert to authenticated with check (public.tiene_acceso());
create policy rum_manejo_cambio on public.rum_manejo for update to authenticated
  using (public.es_profesor() or (autor = auth.uid() and creado > now() - interval '24 hours')) with check (public.tiene_acceso());
create policy rum_manejo_borrado on public.rum_manejo for delete to authenticated
  using (public.es_profesor() or (autor = auth.uid() and creado > now() - interval '24 hours'));
