-- Joint services, and merging a duplicate service into another.
--
-- Joint services: a service (or a repeating one) belongs to one main region,
-- whose Drive holds its files and whose admins run it, and can also be for
-- other regions (a combined service). People in any of those regions see it
-- and can upload to it.
--
-- Merging: when two services were created for the same event, everything in
-- one moves into the other and the extra one is deleted. The server moves the
-- files in Drive first, then calls merge_service_records() for the rest.

alter table public.services
  add column shared_region_ids uuid[] not null default '{}';
alter table public.service_series
  add column shared_region_ids uuid[] not null default '{}';

-- A service is never "also for" its own main region.
alter table public.services
  add constraint services_shared_not_main check (not (region_id = any (shared_region_ids)));
alter table public.service_series
  add constraint service_series_shared_not_main check (not (region_id = any (shared_region_ids)));

create index services_shared_regions_idx on public.services using gin (shared_region_ids);

-- People see a service if it is in, or also for, one of their regions. Only
-- the main region's admins manage it (those rules are unchanged).
drop policy "People can read their regions' services" on public.services;
create policy "People can read their regions' services"
  on public.services for select to authenticated
  using (
    region_id in (select unnest(private.my_region_ids()))
    or shared_region_ids && (select private.my_region_ids())
  );

drop policy "People can read their regions' recurring services" on public.service_series;
create policy "People can read their regions' recurring services"
  on public.service_series for select to authenticated
  using (
    region_id in (select unnest(private.my_region_ids()))
    or shared_region_ids && (select private.my_region_ids())
  );

-- Region admins may only mark their service as also for real regions.
create function private.check_shared_regions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.shared_region_ids := array(
    select distinct r from unnest(new.shared_region_ids) r
    where r <> new.region_id and exists (select 1 from public.regions where id = r)
  );
  return new;
end;
$$;

create trigger services_shared_regions
  before insert or update of shared_region_ids, region_id on public.services
  for each row execute function private.check_shared_regions();
create trigger service_series_shared_regions
  before insert or update of shared_region_ids, region_id on public.service_series
  for each row execute function private.check_shared_regions();

-- ── Merging ─────────────────────────────────────────────────────────────────

-- Moves everything from one service into another and deletes the first.
-- Server only: the server checks the person runs both services' regions and
-- has already moved the files in Drive.
create function public.merge_service_records(p_keep uuid, p_merge uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  keep_service public.services;
  merge_service public.services;
  category record;
begin
  if p_keep = p_merge then
    raise exception 'same_service';
  end if;
  select * into keep_service from public.services where id = p_keep for update;
  select * into merge_service from public.services where id = p_merge for update;
  if keep_service.id is null or merge_service.id is null then
    raise exception 'service_not_found';
  end if;

  -- Files.
  update public.uploads set service_id = p_keep where service_id = p_merge;

  -- Assignments: the same person in the same role becomes one assignment,
  -- with the categories of both (a task done in either stays done).
  insert into public.assignment_categories (assignment_id, category_id, done_at)
  select k.id, ac.category_id, ac.done_at
  from public.assignments m
  join public.assignment_categories ac on ac.assignment_id = m.id
  join public.assignments k
    on k.service_id = p_keep and k.profile_id = m.profile_id and k.duty_role_id = m.duty_role_id
  where m.service_id = p_merge
  on conflict (assignment_id, category_id)
    do update set done_at = coalesce(public.assignment_categories.done_at, excluded.done_at);
  delete from public.assignments m
  where m.service_id = p_merge
    and exists (
      select 1 from public.assignments k
      where k.service_id = p_keep and k.profile_id = m.profile_id and k.duty_role_id = m.duty_role_id
    );
  update public.assignments set service_id = p_keep where service_id = p_merge;

  -- A team that already confirmed it received a category keeps that.
  update public.handoffs k
  set received_at = m.received_at, received_by = m.received_by
  from public.handoffs m
  where k.service_id = p_keep and m.service_id = p_merge
    and k.category_id = m.category_id and k.team_id = m.team_id
    and k.received_at is null and m.received_at is not null;

  -- Share links of the extra service now show the kept one.
  update public.share_links set service_id = p_keep where service_id = p_merge;

  -- The kept service is also for every region either was for.
  update public.services
  set shared_region_ids = array(
    select distinct r
    from unnest(keep_service.shared_region_ids || merge_service.shared_region_ids
                || array[merge_service.region_id]) r
    where r <> keep_service.region_id
  )
  where id = p_keep;

  -- A repeating service's occurrence is not created again.
  if merge_service.series_id is not null and merge_service.series_slot is not null then
    insert into public.service_series_skips (series_id, series_slot)
    values (merge_service.series_id, merge_service.series_slot)
    on conflict do nothing;
  end if;

  delete from public.services where id = p_merge;

  for category in select id from public.categories loop
    perform private.refresh_handoff_ready(p_keep, category.id);
  end loop;
end;
$$;

revoke all on function public.merge_service_records(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_service_records(uuid, uuid) to service_role;
revoke all on function private.check_shared_regions() from public, anon;
