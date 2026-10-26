-- =====================================================================
-- CIFEAFARM · Catálogo de productos: posología por especie de destino
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible.
--
-- · Añade la posología de cada especie (cabras, ovejas, cerdos).
-- · La antigua «dosificación» NO se borra: la primera vez se copia a la
--   posología de las especies marcadas en cada producto (o a las tres si
--   no tenía ninguna marcada), para que la reviséis en la app.
-- =====================================================================

alter table public.medicamentos add column if not exists posologia jsonb not null default '{}'::jsonb;

update public.medicamentos m
   set posologia = (select jsonb_object_agg(e, m.dosis)
                      from unnest(case when coalesce(cardinality(m.especies), 0) > 0 then m.especies
                                       else array['caprino','ovino','porcino'] end) as e)
 where m.posologia = '{}'::jsonb and nullif(trim(m.dosis), '') is not null;
