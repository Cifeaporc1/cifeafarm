-- =====================================================================
-- CIFEAFARM · Cancelar lo programado en sanidad
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible:
-- se puede ejecutar varias veces y no borra ningún dato.
--
-- En las dos granjas (cabras y ovejas · porcino): un tratamiento o control
-- previsto se puede cancelar con fecha, motivo y detalle. No se borra:
-- queda como «cancelado» y se puede deshacer.
-- =====================================================================

-- ---------- 1. Admitir el estado «cancelado» (se quita la regla antigua y se pone la nueva)
do $$
declare c record;
begin
  for c in select conrelid::regclass as tabla, conname from pg_constraint
           where conrelid in ('public.rum_sanidad'::regclass, 'public.sanidad'::regclass)
             and contype = 'c' and pg_get_constraintdef(oid) like '%(estado = ANY%' loop
    execute format('alter table %s drop constraint %I', c.tabla, c.conname);
  end loop;
end $$;
alter table public.rum_sanidad add constraint rum_sanidad_estado_check check (estado in ('previsto','realizado','cancelado'));
alter table public.sanidad add constraint sanidad_estado_check check (estado in ('previsto','realizado','cancelado'));

-- ---------- 2. Datos de la cancelación (en las dos tablas de sanidad)
alter table public.rum_sanidad add column if not exists cancelado_fecha date;
alter table public.rum_sanidad add column if not exists cancelado_motivo text check (cancelado_motivo in ('prescripcion','retirado','cambio','baja','otro'));
alter table public.rum_sanidad add column if not exists cancelado_detalle text;
alter table public.rum_sanidad add column if not exists cancelado_por text;

alter table public.sanidad add column if not exists cancelado_fecha date;
alter table public.sanidad add column if not exists cancelado_motivo text check (cancelado_motivo in ('prescripcion','retirado','cambio','baja','otro'));
alter table public.sanidad add column if not exists cancelado_detalle text;
alter table public.sanidad add column if not exists cancelado_por text;
