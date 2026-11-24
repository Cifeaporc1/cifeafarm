-- =====================================================================
-- CIFEAFARM · Sexo en las muertes, ventas y salidas a matadero de lechones y cebo
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible:
-- se puede ejecutar varias veces y no borra ningún dato.
--
-- Añade a mov_grupos cuántos son hembras y cuántos machos (opcional).
-- Si se rellenan, entre los dos tienen que sumar el número de animales.
-- (Las bajas de lechones de una cerda lactante no necesitan nada: van en el registro.)
-- =====================================================================
alter table public.mov_grupos add column if not exists hembras smallint;
alter table public.mov_grupos add column if not exists machos  smallint;

alter table public.mov_grupos drop constraint if exists mov_grupos_sexo;
alter table public.mov_grupos add constraint mov_grupos_sexo check (
  (hembras is null and machos is null)
  or (coalesce(hembras, 0) >= 0 and coalesce(machos, 0) >= 0 and coalesce(hembras, 0) + coalesce(machos, 0) = n)
);
