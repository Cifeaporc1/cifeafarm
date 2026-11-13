-- =====================================================================
-- CIFEAFARM · Cuánto ocupan las fotos (almacén y roturas)
-- Pegar entero en Supabase → SQL Editor → New query → Run. Repetible.
-- La app avisa cuando las fotos se acercan al límite del plan gratuito (1 GB).
-- =====================================================================
create or replace function public.uso_fotos() returns table (fotos bigint, bytes bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.tiene_acceso() then raise exception 'Sin acceso'; end if;
  if to_regclass('storage.objects') is null then fotos := 0; bytes := 0; return next; return; end if;
  return query execute $q$select count(*)::bigint, coalesce(sum((metadata->>'size')::bigint), 0)::bigint
                            from storage.objects where bucket_id = 'cifeafarm-fotos'$q$;
end $$;
revoke all on function public.uso_fotos() from public, anon;
grant execute on function public.uso_fotos() to authenticated;
