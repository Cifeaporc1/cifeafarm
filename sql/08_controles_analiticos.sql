-- =====================================================================
-- CIFEAFARM · Controles analíticos y carácter de lo programado
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible:
-- se puede ejecutar varias veces y no borra ningún dato.
--
-- En las dos granjas (cabras y ovejas · porcino):
-- · Nuevo tipo en sanidad: «Control analítico» (qué se analiza, tipo de
--   muestra, laboratorio y, al hacerlo, el resultado).
-- · Carácter de lo programado: obligatorio, recomendado o voluntario.
-- =====================================================================

-- ---------- 1. Admitir el tipo «analitica» (se quita la regla antigua y se pone la nueva)
do $$
declare c record;
begin
  for c in select conrelid::regclass as tabla, conname from pg_constraint
           where conrelid in ('public.rum_sanidad'::regclass, 'public.sanidad'::regclass)
             and contype = 'c' and pg_get_constraintdef(oid) like '%(tipo = ANY%' loop
    execute format('alter table %s drop constraint %I', c.tabla, c.conname);
  end loop;
end $$;

alter table public.rum_sanidad add constraint rum_sanidad_tipo_check
  check (tipo in ('vacunacion','desparasitacion','tratamiento','vitaminas','pezunas','analitica','otro'));
alter table public.sanidad add constraint sanidad_tipo_check
  check (tipo in ('vacunacion','desparasitacion','tratamiento','hierro','colmillos','raboteo','castracion',
                  'limpieza','desinfeccion','desinsectacion','desratizacion','analitica','otro'));

-- ---------- 2. Columnas nuevas (en las dos tablas de sanidad)
alter table public.rum_sanidad add column if not exists caracter text check (caracter in ('obligatorio','recomendado','voluntario'));
alter table public.rum_sanidad add column if not exists analisis text;        -- qué se analiza
alter table public.rum_sanidad add column if not exists muestra text;         -- sangre, leche, heces…
alter table public.rum_sanidad add column if not exists laboratorio text;
alter table public.rum_sanidad add column if not exists resultado text check (resultado in ('pendiente','negativo','positivo'));
alter table public.rum_sanidad add column if not exists resultado_nota text;

alter table public.sanidad add column if not exists caracter text check (caracter in ('obligatorio','recomendado','voluntario'));
alter table public.sanidad add column if not exists analisis text;
alter table public.sanidad add column if not exists muestra text;
alter table public.sanidad add column if not exists laboratorio text;
alter table public.sanidad add column if not exists resultado text check (resultado in ('pendiente','negativo','positivo'));
alter table public.sanidad add column if not exists resultado_nota text;
