-- =====================================================================
-- CIFEAFARM · Repetir tratamientos cada X días, semanas, meses o años
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible:
-- se puede ejecutar varias veces y no borra ningún dato.
--
-- En las dos granjas. Lo que ya se repetía «cada N días» sigue igual.
-- =====================================================================

alter table public.rum_sanidad add column if not exists repetir_n integer check (repetir_n > 0);
alter table public.rum_sanidad add column if not exists repetir_unidad text check (repetir_unidad in ('dias','semanas','meses','anios'));
alter table public.sanidad add column if not exists repetir_n integer check (repetir_n > 0);
alter table public.sanidad add column if not exists repetir_unidad text check (repetir_unidad in ('dias','semanas','meses','anios'));

-- Lo antiguo (solo «repetir_dias») no se toca: la app lo sigue leyendo como días.
