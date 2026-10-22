-- =====================================================================
-- CIFEAFARM · Porcino: de dos granjas (una por curso) a UNA granja real
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible.
--
-- ANTES: descarga una copia de seguridad en CIFEAPORC
--        (Gestión → Granja → Descargar Excel y Archivo para restaurar).
--
-- · La granja real es la 2 (la que usaba 2.º). Los alumnos de los dos
--   cursos ven y registran en ella; cada registro guarda quién lo hizo,
--   y su curso es el de su perfil.
-- · Como siempre: el alumno corrige o borra lo suyo durante 24 h;
--   después, solo el profesor.
-- · NO borra nada. Los datos de la antigua granja de 1.º se quedan
--   guardados y sin mostrarse; para borrarlos, ver 03_borrar_granja_1.sql.
-- =====================================================================

-- Las "granjas" pasan a ser solo los cursos de los alumnos.
update public.granjas set nombre = '1.º curso' where id = 1;
update public.granjas set nombre = '2.º curso' where id = 2;

-- Reglas de acceso: todos los usuarios activos en la granja real.
do $$
declare t text;
begin
  foreach t in array array['eventos','sanidad','extracciones','recuentos','mov_grupos'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %1$s_ver on public.%1$s', t);
    execute format('drop policy if exists %1$s_alta on public.%1$s', t);
    execute format('drop policy if exists %1$s_cambio on public.%1$s', t);
    execute format('drop policy if exists %1$s_borrado on public.%1$s', t);
    execute format('create policy %1$s_ver on public.%1$s for select to authenticated using (public.tiene_acceso())', t);
    execute format('create policy %1$s_alta on public.%1$s for insert to authenticated with check (public.tiene_acceso() and (granja_id = 2 or public.es_profesor()))', t);
    execute format($p$create policy %1$s_cambio on public.%1$s for update to authenticated
      using (public.es_profesor() or (autor = auth.uid() and creado > now() - interval '24 hours'))
      with check (public.tiene_acceso())$p$, t);
    execute format($p$create policy %1$s_borrado on public.%1$s for delete to authenticated
      using (public.es_profesor() or (autor = auth.uid() and creado > now() - interval '24 hours'))$p$, t);
  end loop;
end $$;
