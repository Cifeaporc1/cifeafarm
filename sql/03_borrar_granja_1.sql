-- =====================================================================
-- CIFEAFARM · OPCIONAL: borrar los registros de la antigua granja de 1.º
-- Solo después de 02_porcino_unido.sql y con una copia de seguridad.
-- NO se puede deshacer. No toca el censo (cerdas y verracos son comunes),
-- ni los alumnos, ni nada de la granja real (la 2) ni de CIFEARUMI.
-- =====================================================================
delete from public.eventos      where granja_id = 1;
delete from public.sanidad      where granja_id = 1;
delete from public.extracciones where granja_id = 1;
delete from public.recuentos    where granja_id = 1;
delete from public.mov_grupos   where granja_id = 1;
