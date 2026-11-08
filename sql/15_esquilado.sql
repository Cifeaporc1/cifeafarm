-- =====================================================================
-- CIFEAFARM · Esquilado de las ovejas en Sanidad
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible:
-- se puede ejecutar varias veces y no borra ningún dato.
--
-- Añade «Esquilado» a los tipos de sanidad de rumiantes.
-- =====================================================================

do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.rum_sanidad'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%(tipo = ANY%' loop
    execute format('alter table public.rum_sanidad drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.rum_sanidad add constraint rum_sanidad_tipo_check
  check (tipo in ('vacunacion','desparasitacion','tratamiento','vitaminas','pezunas','esquilado','analitica','otro'));
