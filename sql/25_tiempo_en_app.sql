-- =====================================================================
-- CIFEAFARM · Tiempo de uso de la app por alumno (para «Actividad para evaluar»)
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible:
-- se puede ejecutar varias veces y no borra ningún dato.
--
-- 1. Tabla uso_app: minutos de uso por alumno, día y app (rumi = CIFEARUMI y
--    lo común; porc = CIFEAPORC). Solo cuenta un minuto si la app está a la
--    vista y el alumno ha tocado algo en los 2 últimos minutos.
-- 2. sumar_minuto(): la app la llama una vez por minuto. Solo apunta alumnos.
-- 3. Lo ve el administrador; cada alumno ve solo lo suyo.
-- 4. nombres_visibles() (la del 13_mejoras_noviembre.sql) devuelve también si la
--    persona está activa, para que la actividad liste a quien no ha hecho nada.
-- =====================================================================

-- ---------- 1. Tabla
create table if not exists public.uso_app (
  user_id uuid not null references auth.users(id) on delete cascade,
  dia     date not null default current_date,
  modulo  text not null check (modulo in ('rumi', 'porc')),
  minutos integer not null default 0,
  alias   text,
  curso   smallint,
  primary key (user_id, dia, modulo)
);
alter table public.uso_app enable row level security;
drop policy if exists uso_app_ver on public.uso_app;
create policy uso_app_ver on public.uso_app for select to authenticated
  using (public.es_admin() or user_id = auth.uid());
-- Nadie escribe directamente: solo a través de sumar_minuto()

-- ---------- 2. Sumar un minuto
create or replace function public.sumar_minuto(p_modulo text) returns void
language plpgsql security definer set search_path = public as $$
declare a text; c smallint; r text;
begin
  if p_modulo not in ('rumi', 'porc') then return; end if;
  select alias, granja_id, rol into a, c, r from perfiles where user_id = auth.uid() and activo;
  if r is distinct from 'alumno' then return; end if;
  insert into uso_app (user_id, dia, modulo, minutos, alias, curso)
    values (auth.uid(), (now() at time zone 'Europe/Madrid')::date, p_modulo, 1, a, c)
  on conflict (user_id, dia, modulo) do update
    set minutos = least(uso_app.minutos + 1, 1440), alias = excluded.alias, curso = excluded.curso;
end $$;
revoke all on function public.sumar_minuto(text) from public, anon;
grant execute on function public.sumar_minuto(text) to authenticated;

-- ---------- 4. nombres_visibles con «activo» (se rehace porque cambia lo que devuelve)
drop function if exists public.nombres_visibles();
create function public.nombres_visibles()
returns table (user_id uuid, alias text, nombre text, rol text, granja_id smallint, activo boolean)
language sql stable security definer set search_path = public as $$
  select p.user_id,
         case when public.es_admin() or p.rol <> 'alumno' or p.user_id = auth.uid() then p.alias end,
         case when public.es_admin() or p.rol <> 'alumno' or p.user_id = auth.uid() then p.nombre end,
         p.rol, p.granja_id, p.activo
  from perfiles p
  where public.tiene_acceso();
$$;
revoke all on function public.nombres_visibles() from public, anon;
grant execute on function public.nombres_visibles() to authenticated;
