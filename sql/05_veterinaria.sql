-- =====================================================================
-- CIFEAFARM · Perfil VETERINARIA (las dos granjas)
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible.
--
-- La veterinaria puede lo mismo que el profesor con animales, registros,
-- catálogo de productos y gestión de la granja (importar el censo, copias,
-- corralinas, acceso por curso, borrar animales). Solo el profesor: los
-- alumnos (cuentas, PIN, nombres) y su actividad. La veterinaria no ve a
-- los alumnos: ni sus nombres ni sus alias.
--
-- Para dar de alta a la veterinaria, ver el final de este archivo.
-- =====================================================================

-- ---------- 1. Nuevo rol en los perfiles
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.perfiles'::regclass and contype = 'c' loop
    execute format('alter table public.perfiles drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('alumno', 'profesor', 'veterinario'));
alter table public.perfiles add constraint perfiles_curso_check check (rol <> 'alumno' or granja_id is not null);

-- ---------- 2. Quién es quién
-- es_admin(): solo el profesor (controla la aplicación).
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where user_id = auth.uid() and rol = 'profesor' and activo);
$$;
-- es_profesor(): profesor o veterinaria (permisos sobre animales y registros en las dos granjas).
create or replace function public.es_profesor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where user_id = auth.uid() and rol in ('profesor', 'veterinario') and activo);
$$;

-- ---------- 3. Lo que queda solo para el profesor
drop policy if exists perfiles_ver on public.perfiles;
drop policy if exists perfiles_alta on public.perfiles;
drop policy if exists perfiles_cambio on public.perfiles;
create policy perfiles_ver on public.perfiles for select to authenticated using (user_id = auth.uid() or public.es_admin());
create policy perfiles_alta on public.perfiles for insert to authenticated with check (public.es_admin());
create policy perfiles_cambio on public.perfiles for update to authenticated using (public.es_admin()) with check (public.es_admin());

-- Gestión de la granja: profesor y veterinaria.
drop policy if exists granjas_cambio on public.granjas;
create policy granjas_cambio on public.granjas for update to authenticated using (public.es_profesor()) with check (public.es_profesor());

drop policy if exists rum_animales_borrado on public.rum_animales;
create policy rum_animales_borrado on public.rum_animales for delete to authenticated using (public.es_profesor());

create or replace function public.restablecer_pin(p_user uuid, p_pin text)
returns void language plpgsql security definer
set search_path = public, extensions, auth as $$
begin
  if not public.es_admin() then raise exception 'Solo el profesor puede restablecer PIN'; end if;
  if p_pin !~ '^[0-9]{6}$' then raise exception 'El PIN debe tener 6 cifras'; end if;
  if not exists (select 1 from public.perfiles where user_id = p_user and rol in ('alumno', 'veterinario')) then
    raise exception 'Solo se puede restablecer el PIN de un alumno o de la veterinaria';
  end if;
  update auth.users set encrypted_password = extensions.crypt(p_pin, extensions.gen_salt('bf')), updated_at = now()
   where id = p_user;
end $$;
revoke all on function public.restablecer_pin(uuid, text) from public, anon;
grant execute on function public.restablecer_pin(uuid, text) to authenticated;

create or replace function public.cerrar_curso()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.es_admin() then raise exception 'Solo el profesor puede cerrar el curso'; end if;
  update perfiles set activo = false, nombre = null where rol = 'alumno';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.cerrar_curso() from public, anon;
grant execute on function public.cerrar_curso() to authenticated;

-- Nombres y alias: el profesor ve todos; cada alumno, los de su curso;
-- la veterinaria, a los profesores (de los alumnos solo su curso, sin alias ni nombre).
create or replace function public.nombres_visibles()
returns table (user_id uuid, alias text, nombre text, rol text, granja_id smallint)
language sql stable security definer set search_path = public as $$
  select p.user_id,
         case when public.es_admin() or p.rol <> 'alumno' or p.granja_id = public.mi_granja() then p.alias end,
         case when public.es_admin() or p.rol <> 'alumno' or p.granja_id = public.mi_granja() then p.nombre end,
         p.rol, p.granja_id
  from perfiles p
  where public.tiene_acceso()
    and (public.es_profesor() or p.rol <> 'alumno' or p.granja_id = public.mi_granja());
$$;
revoke all on function public.nombres_visibles() from public, anon;
grant execute on function public.nombres_visibles() to authenticated;

-- =====================================================================
-- DAR DE ALTA A LA VETERINARIA: desde la app, sin correo.
-- CIFEAFARM → Más → Gestión → Veterinaria → alias y PIN (como a un alumno).
-- Ella entra con la pestaña «Veterinaria», su alias y su PIN.
-- =====================================================================
