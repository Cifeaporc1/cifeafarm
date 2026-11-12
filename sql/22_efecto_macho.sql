-- =====================================================================
-- CIFEAFARM · «Parque erótico» pasa a llamarse «Parque vacías efecto macho»
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible:
-- se puede ejecutar varias veces y no borra ningún dato.
-- Cambia el nombre en lo ya anotado (traslados, silos, piensos, roturas, sanidad).
-- =====================================================================
do $$
declare viejo text := 'Parque erótico'; nuevo text := 'Parque vacías efecto macho'; t text;
begin
  -- Ubicación y zona guardadas dentro de los eventos de las cerdas
  update public.eventos set datos = jsonb_set(datos, '{ubicacion}', to_jsonb(nuevo)) where datos->>'ubicacion' = viejo;
  update public.eventos set datos = jsonb_set(datos, '{zona}', '"Efecto macho"') where datos->>'zona' = 'Erótico';
  -- Silos que dan de comer a esa zona
  if to_regclass('public.silos') is not null then
    update public.silos set zonas = array_replace(zonas, viejo, nuevo) where viejo = any(zonas);
  end if;
  -- Columnas «zona» con el nombre antiguo
  foreach t in array array['pienso_incidencias', 'roturas', 'sanidad'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'zona') then continue; end if;
    execute format('update public.%I set zona = $2 where zona = $1', t) using viejo, nuevo;
  end loop;
end $$;
