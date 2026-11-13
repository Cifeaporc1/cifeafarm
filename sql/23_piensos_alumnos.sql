-- =====================================================================
-- CIFEAFARM · Los alumnos pueden dar de alta fichas de pienso
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible.
-- Cambiar o borrar una ficha sigue siendo del profesorado (borrar, del administrador).
-- =====================================================================
drop policy if exists piensos_alta on public.piensos;
create policy piensos_alta on public.piensos for insert to authenticated with check (public.tiene_acceso());
