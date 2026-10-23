-- =====================================================================
-- CIFEAFARM · Interruptor de acceso por curso (las dos granjas)
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible.
--
-- · Cada curso (1.º, 2.º) tiene acceso abierto o cerrado. Con el acceso
--   cerrado, sus alumnos no ven ni registran nada en ninguna granja.
-- · No toca las cuentas: al abrirlo, todo vuelve a estar como estaba
--   (y un alumno desactivado a mano sigue desactivado).
-- · Lo cambian el profesor o la veterinaria en CIFEAFARM → Más → Gestión → Acceso por curso.
-- =====================================================================

alter table public.granjas add column if not exists acceso boolean not null default true;

-- tiene_acceso(): perfil activo y, si es alumno, su curso abierto.
create or replace function public.tiene_acceso() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles p left join granjas g on g.id = p.granja_id
                 where p.user_id = auth.uid() and p.activo
                   and (p.rol = 'profesor' or coalesce(g.acceso, true)));
$$;

-- mi_granja(): solo con el curso abierto (las reglas antiguas de porcino la usan).
create or replace function public.mi_granja() returns smallint
language sql stable security definer set search_path = public as $$
  select p.granja_id from perfiles p left join granjas g on g.id = p.granja_id
  where p.user_id = auth.uid() and p.activo and coalesce(g.acceso, true);
$$;

drop policy if exists granjas_cambio on public.granjas;
create policy granjas_cambio on public.granjas for update to authenticated
  using (exists (select 1 from public.perfiles where user_id = auth.uid() and rol in ('profesor', 'veterinario') and activo))
  with check (exists (select 1 from public.perfiles where user_id = auth.uid() and rol in ('profesor', 'veterinario') and activo));
