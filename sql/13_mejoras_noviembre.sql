-- =====================================================================
-- CIFEAFARM · Contraindicaciones, pautas de tratamiento y nombres de alumnos
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible:
-- se puede ejecutar varias veces y no borra ningún dato.
-- Si alguna vez vuelves a ejecutar 05_veterinaria.sql, ejecuta después este.
--
-- 1. Contraindicaciones en la ficha de cada producto.
-- 2. Pauta de un tratamiento: las dosis siguientes con sus intervalos
--    (por ejemplo, recuerdo a los 21 días y después cada año).
-- 3. Los nombres y alias de los alumnos solo los ve el administrador;
--    cada alumno sigue viendo los suyos.
-- =====================================================================

-- ---------- 1. Contraindicaciones
alter table public.medicamentos add column if not exists contraindicaciones text;

-- ---------- 2. Pauta: dosis que faltan, en orden: [{"n":21,"u":"dias"}, …]
alter table public.rum_sanidad add column if not exists pauta jsonb not null default '[]'::jsonb;
alter table public.sanidad add column if not exists pauta jsonb not null default '[]'::jsonb;

-- ---------- 3. Nombres visibles: los de los alumnos, solo para el administrador
create or replace function public.nombres_visibles()
returns table (user_id uuid, alias text, nombre text, rol text, granja_id smallint)
language sql stable security definer set search_path = public as $$
  select p.user_id,
         case when public.es_admin() or p.rol <> 'alumno' or p.user_id = auth.uid() then p.alias end,
         case when public.es_admin() or p.rol <> 'alumno' or p.user_id = auth.uid() then p.nombre end,
         p.rol, p.granja_id
  from perfiles p
  where public.tiene_acceso();
$$;
revoke all on function public.nombres_visibles() from public, anon;
grant execute on function public.nombres_visibles() to authenticated;
