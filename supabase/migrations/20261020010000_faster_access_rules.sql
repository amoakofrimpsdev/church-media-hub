-- Faster access rules: the same rules, worked out once per query instead of
-- once per row.
--
-- With regions, the rules on uploads called private.in_region(...) for every
-- row, and that looked the person up again each time. The load test
-- (tests/perf) showed the home page's charts, which read every finished
-- upload, taking over a second with two years of photos.
--
-- Now each rule asks once "which regions (or categories, or teams) can this
-- person see?" as a list, used as "in (select unnest(...))" so Postgres works it out a
-- single time, and rows are matched against that list. Rows on other tables
-- are reached through the services table, whose rule is the cheap one.

-- ── What the signed-in person can see, as lists ─────────────────────────────

create function private.my_region_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.current_app_role() is null then '{}'::uuid[]
    when private.is_admin() then (select coalesce(array_agg(id), '{}') from public.regions)
    else (
      select coalesce(array_agg(region_id), '{}') from public.region_members
      where profile_id = (select auth.uid())
    )
  end
$$;

create function private.my_managed_region_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.is_admin() then (select coalesce(array_agg(id), '{}') from public.regions)
    when private.current_app_role() = 'member' then (
      select coalesce(array_agg(region_id), '{}') from public.region_members
      where profile_id = (select auth.uid()) and is_region_admin
    )
    else '{}'::uuid[]
  end
$$;

-- Admins and members see every category; viewers only those delivered to
-- one of their teams.
create function private.my_category_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case private.current_app_role()
    when 'admin' then (select coalesce(array_agg(id), '{}') from public.categories)
    when 'member' then (select coalesce(array_agg(id), '{}') from public.categories)
    when 'viewer' then (
      select coalesce(array_agg(distinct ct.category_id), '{}')
      from public.category_teams ct
      join public.team_members tm on tm.team_id = ct.team_id
      where tm.profile_id = (select auth.uid())
    )
    else '{}'::uuid[]
  end
$$;

create function private.my_team_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(team_id), '{}') from public.team_members
  where profile_id = (select auth.uid()) and private.current_app_role() is not null
$$;

revoke all on function private.my_region_ids(), private.my_managed_region_ids(),
  private.my_category_ids(), private.my_team_ids() from public, anon;
grant execute on function private.my_region_ids(), private.my_managed_region_ids(),
  private.my_category_ids(), private.my_team_ids() to authenticated;

-- ── Services and schedules ──────────────────────────────────────────────────

drop policy "People can read their regions' services" on public.services;
drop policy "Region admins manage their region's services" on public.services;
create policy "People can read their regions' services"
  on public.services for select to authenticated
  using (region_id in (select unnest(private.my_region_ids())));
create policy "Region admins manage their region's services"
  on public.services for all to authenticated
  using (region_id in (select unnest(private.my_managed_region_ids())))
  with check (region_id in (select unnest(private.my_managed_region_ids())));

drop policy "People can read their regions' recurring services" on public.service_series;
drop policy "Region admins manage their region's recurring services" on public.service_series;
create policy "People can read their regions' recurring services"
  on public.service_series for select to authenticated
  using (region_id in (select unnest(private.my_region_ids())));
create policy "Region admins manage their region's recurring services"
  on public.service_series for all to authenticated
  using (region_id in (select unnest(private.my_managed_region_ids())))
  with check (region_id in (select unnest(private.my_managed_region_ids())));

drop policy "Region admins manage skipped occurrences" on public.service_series_skips;
create policy "Region admins manage skipped occurrences"
  on public.service_series_skips for all to authenticated
  using (exists (
    select 1 from public.service_series s
    where s.id = series_id and s.region_id in (select unnest(private.my_managed_region_ids()))
  ))
  with check (exists (
    select 1 from public.service_series s
    where s.id = series_id and s.region_id in (select unnest(private.my_managed_region_ids()))
  ));

-- ── Things that hang off a service ──────────────────────────────────────────
-- "exists (select 1 from services ...)" goes through the services rule above,
-- so it already means "a service in one of my regions".

drop policy "People can read their regions' service folders" on public.service_folders;
drop policy "Region admins manage their region's service folders" on public.service_folders;
create policy "People can read their regions' service folders"
  on public.service_folders for select to authenticated
  using (exists (select 1 from public.services s where s.id = service_id));
create policy "Region admins manage their region's service folders"
  on public.service_folders for all to authenticated
  using (exists (
    select 1 from public.services s
    where s.id = service_id and s.region_id in (select unnest(private.my_managed_region_ids()))
  ))
  with check (exists (
    select 1 from public.services s
    where s.id = service_id and s.region_id in (select unnest(private.my_managed_region_ids()))
  ));

drop policy "People can read uploads they are allowed to see" on public.uploads;
create policy "People can read uploads they are allowed to see"
  on public.uploads for select to authenticated
  using (
    category_id in (select unnest(private.my_category_ids()))
    and exists (select 1 from public.services s where s.id = service_id)
    and (
      status = 'complete'
      or (select private.current_app_role()) in ('admin', 'member')
    )
  );

drop policy "Admins and members can start uploads in their regions" on public.uploads;
create policy "Admins and members can start uploads in their regions"
  on public.uploads for insert to authenticated
  with check (
    (select private.current_app_role()) in ('admin', 'member')
    and exists (select 1 from public.services s where s.id = service_id)
    and uploaded_by = (select auth.uid())
    and status = 'uploading'
    and drive_file_id is null
  );

drop policy "Region admins can delete upload records" on public.uploads;
create policy "Region admins can delete upload records"
  on public.uploads for delete to authenticated
  using (exists (
    select 1 from public.services s
    where s.id = service_id and s.region_id in (select unnest(private.my_managed_region_ids()))
  ));

drop policy "People can read their regions' assignments" on public.assignments;
drop policy "Region admins manage their region's assignments" on public.assignments;
create policy "People can read their regions' assignments"
  on public.assignments for select to authenticated
  using (exists (select 1 from public.services s where s.id = service_id));
create policy "Region admins manage their region's assignments"
  on public.assignments for all to authenticated
  using (exists (
    select 1 from public.services s
    where s.id = service_id and s.region_id in (select unnest(private.my_managed_region_ids()))
  ))
  with check (exists (
    select 1 from public.services s
    where s.id = service_id and s.region_id in (select unnest(private.my_managed_region_ids()))
  ));

drop policy "People can read their regions' assignment categories" on public.assignment_categories;
drop policy "Region admins manage their region's assignment categories" on public.assignment_categories;
create policy "People can read their regions' assignment categories"
  on public.assignment_categories for select to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id));
create policy "Region admins manage their region's assignment categories"
  on public.assignment_categories for all to authenticated
  using (exists (
    select 1 from public.assignments a join public.services s on s.id = a.service_id
    where a.id = assignment_id and s.region_id in (select unnest(private.my_managed_region_ids()))
  ))
  with check (exists (
    select 1 from public.assignments a join public.services s on s.id = a.service_id
    where a.id = assignment_id and s.region_id in (select unnest(private.my_managed_region_ids()))
  ));

drop policy "People can read handoffs for their teams" on public.handoffs;
create policy "People can read handoffs for their teams"
  on public.handoffs for select to authenticated
  using (
    exists (select 1 from public.services s where s.id = service_id)
    and (
      (select private.current_app_role()) in ('admin', 'member')
      or team_id in (select unnest(private.my_team_ids()))
    )
  );

drop policy "People can read their regions' members" on public.region_members;
create policy "People can read their regions' members"
  on public.region_members for select to authenticated
  using ((select private.runs_a_region()) or region_id in (select unnest(private.my_region_ids())));

-- Lookups the rules above lean on.
create index if not exists assignments_service_idx on public.assignments (service_id);
create index if not exists handoffs_service_idx on public.handoffs (service_id);
create index if not exists uploads_service_idx on public.uploads (service_id);
