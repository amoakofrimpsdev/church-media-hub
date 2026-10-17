-- Regions: Metro Heights, OC, West Valley and any added later.
--
-- Every service belongs to a region, and people belong to one or more
-- regions. Members and viewers see only their regions. Overall admins (role
-- 'admin') manage everything; a region admin manages one region's services,
-- schedule, assignments, people, Drive and Telegram group.
--
-- Storage: a region uses a folder in the church Google Drive by default, or
-- its own Google account if a region admin connects one. Each service records
-- which account holds its files, so a region can switch later without
-- breaking older services.
--
-- Telegram: a region posts to its own group if one is linked, otherwise to
-- the church's main group (app_settings).
--
-- Everything that exists today goes into a first region, "Main", which an
-- admin can rename. Its Drive folder is the existing "RCW Media" folder, so no
-- files move.

-- ── Tables ──────────────────────────────────────────────────────────────────

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 60),
  sort_order integer not null default 0,
  -- Retired regions stay so old services keep their region.
  is_active boolean not null default true,
  -- This region's folder in the church Drive. Made when first needed.
  church_folder_id text,
  -- The region's own Telegram group, if linked. Server-only columns.
  telegram_chat_id bigint unique,
  telegram_chat_title text,
  telegram_linked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.region_members (
  region_id uuid not null references public.regions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  is_region_admin boolean not null default false,
  added_at timestamptz not null default now(),
  primary key (region_id, profile_id)
);

create index region_members_profile_idx on public.region_members (profile_id);

-- A region's own Google account, when it does not use the church Drive.
-- Holds an encrypted token: server-only, like google_connection.
create table public.region_google_connections (
  region_id uuid primary key references public.regions (id) on delete cascade,
  account_email text not null,
  refresh_token_encrypted text not null,
  root_folder_id text not null,
  status public.google_connection_status not null default 'connected',
  last_error text,
  -- False once the region goes back to the church Drive. The connection is
  -- kept while older services still have files in this account.
  for_new_services boolean not null default true,
  connected_by uuid references public.profiles (id) on delete set null,
  connected_at timestamptz not null default now()
);

-- While there is only one region, new services and schedules go into it
-- without anyone having to choose. With several, the region must be given.
create function private.only_region()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) = 1 then (array_agg(id))[1] end
  from public.regions where is_active
$$;

-- ── The first region, holding everything that exists today ──────────────────

insert into public.regions (name, sort_order, church_folder_id)
select 'Main', 0, (select root_folder_id from public.google_connection);

alter table public.services
  add column region_id uuid references public.regions (id) on delete restrict,
  -- Whose Drive holds this service's files: null is the church account,
  -- otherwise the region whose own account it is.
  add column drive_region_id uuid references public.regions (id) on delete restrict;
update public.services set region_id = (select id from public.regions);
alter table public.services
  alter column region_id set not null,
  alter column region_id set default private.only_region();
create index services_region_idx on public.services (region_id, starts_at);

alter table public.service_series
  add column region_id uuid references public.regions (id) on delete restrict;
update public.service_series set region_id = (select id from public.regions);
alter table public.service_series
  alter column region_id set not null,
  alter column region_id set default private.only_region();

insert into public.region_members (region_id, profile_id)
select (select id from public.regions), id from public.profiles;

-- Invites say which region the person joins, and whether they run it.
alter table public.invites
  add column region_id uuid references public.regions (id) on delete set null,
  add column region_admin boolean not null default false;
update public.invites set region_id = (select id from public.regions) where accepted_at is null;
alter table public.invites alter column region_id set default private.only_region();

-- A share link made by a region admin covers only their region. Null: every
-- region (overall admins only).
alter table public.share_links
  add column region_id uuid references public.regions (id) on delete cascade;

-- Drive access given out has to be taken back with the same account.
alter table public.drive_grants
  add column drive_region_id uuid references public.regions (id) on delete cascade;
alter table public.share_file_grants
  add column drive_region_id uuid references public.regions (id) on delete cascade;

-- /linkgroup can link a group to a region.
alter table public.telegram_link_tokens
  add column region_id uuid references public.regions (id) on delete cascade;

-- ── Who can do what, by region ──────────────────────────────────────────────

-- Overall admins are in every region.
create function private.in_region(target_region_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or (
    private.current_app_role() is not null
    and exists (
      select 1 from public.region_members
      where region_id = target_region_id and profile_id = (select auth.uid())
    )
  )
$$;

create function private.manages_region(target_region_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or (
    private.current_app_role() in ('admin', 'member')
    and exists (
      select 1 from public.region_members
      where region_id = target_region_id
        and profile_id = (select auth.uid())
        and is_region_admin
    )
  )
$$;

create function private.service_region(target_service_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select region_id from public.services where id = target_service_id
$$;

-- New people join the region they were invited to.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.invites;
begin
  select * into invite from public.invites where email = lower(new.email);

  if not found then
    raise exception 'not_invited';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    invite.role
  );

  if invite.team_id is not null then
    insert into public.team_members (team_id, profile_id)
    values (invite.team_id, new.id)
    on conflict do nothing;
  end if;

  if invite.region_id is not null then
    insert into public.region_members (region_id, profile_id, is_region_admin)
    values (invite.region_id, new.id, invite.region_admin and invite.role <> 'viewer')
    on conflict do nothing;
  end if;

  update public.invites set accepted_at = now() where email = invite.email;

  return new;
end;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────

revoke all on public.regions, public.region_members, public.region_google_connections
  from anon, authenticated;
-- The Telegram and Drive folder columns are for the server only.
grant select (id, name, sort_order, is_active, created_at) on public.regions to authenticated;
grant insert (name, sort_order), update (name, sort_order, is_active) on public.regions
  to authenticated;
grant select, insert, update, delete on public.region_members to authenticated;
grant all on public.regions, public.region_members, public.region_google_connections
  to service_role;

revoke all on function private.in_region(uuid), private.manages_region(uuid),
  private.service_region(uuid), private.only_region() from public, anon;
grant execute on function private.in_region(uuid), private.manages_region(uuid),
  private.service_region(uuid), private.only_region() to authenticated;
-- The default region is filled in for the server too (scheduled jobs, the
-- secret key), not just for signed-in people.
grant usage on schema private to service_role;
grant execute on function private.only_region() to service_role;

-- ── Row level security ──────────────────────────────────────────────────────

alter table public.regions enable row level security;
alter table public.region_members enable row level security;
alter table public.region_google_connections enable row level security;

-- Region names are not secret: anyone signed in can read them.
create policy "Active people can read regions"
  on public.regions for select to authenticated
  using ((select private.current_app_role()) is not null);

create policy "Admins manage regions"
  on public.regions for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "Active people can read region members"
  on public.region_members for select to authenticated
  using ((select private.current_app_role()) is not null);

-- Region admins add and remove people in their region, but only an overall
-- admin can make someone a region admin.
create policy "Region admins manage their region's people"
  on public.region_members for all to authenticated
  using (private.manages_region(region_id))
  with check (
    private.manages_region(region_id)
    and (not is_region_admin or (select private.is_admin()))
  );

-- Services and everything hanging off them follow the service's region.

drop policy "Active people can read services" on public.services;
drop policy "Admins manage services" on public.services;
create policy "People can read their regions' services"
  on public.services for select to authenticated
  using (private.in_region(region_id));
create policy "Region admins manage their region's services"
  on public.services for all to authenticated
  using (private.manages_region(region_id))
  with check (private.manages_region(region_id));

drop policy "Active people can read service folders" on public.service_folders;
drop policy "Admins manage service folders" on public.service_folders;
create policy "People can read their regions' service folders"
  on public.service_folders for select to authenticated
  using (private.in_region(private.service_region(service_id)));
create policy "Region admins manage their region's service folders"
  on public.service_folders for all to authenticated
  using (private.manages_region(private.service_region(service_id)))
  with check (private.manages_region(private.service_region(service_id)));

drop policy "Active people can read recurring services" on public.service_series;
drop policy "Admins manage recurring services" on public.service_series;
create policy "People can read their regions' recurring services"
  on public.service_series for select to authenticated
  using (private.in_region(region_id));
create policy "Region admins manage their region's recurring services"
  on public.service_series for all to authenticated
  using (private.manages_region(region_id))
  with check (private.manages_region(region_id));

drop policy "Admins manage skipped occurrences" on public.service_series_skips;
create policy "Region admins manage skipped occurrences"
  on public.service_series_skips for all to authenticated
  using (private.manages_region((select region_id from public.service_series where id = series_id)))
  with check (private.manages_region((select region_id from public.service_series where id = series_id)));

drop policy "People can read uploads they are allowed to see" on public.uploads;
create policy "People can read uploads they are allowed to see"
  on public.uploads for select to authenticated
  using (
    private.in_region(private.service_region(service_id))
    and private.can_view_category(category_id)
    and (
      status = 'complete'
      or (select private.current_app_role()) in ('admin', 'member')
    )
  );

drop policy "Admins and members can start uploads" on public.uploads;
create policy "Admins and members can start uploads in their regions"
  on public.uploads for insert to authenticated
  with check (
    (select private.current_app_role()) in ('admin', 'member')
    and private.in_region(private.service_region(service_id))
    and uploaded_by = (select auth.uid())
    and status = 'uploading'
    and drive_file_id is null
  );

drop policy "Admins can delete upload records" on public.uploads;
create policy "Region admins can delete upload records"
  on public.uploads for delete to authenticated
  using (private.manages_region(private.service_region(service_id)));

drop policy "Active people can read assignments" on public.assignments;
drop policy "Admins manage assignments" on public.assignments;
create policy "People can read their regions' assignments"
  on public.assignments for select to authenticated
  using (private.in_region(private.service_region(service_id)));
create policy "Region admins manage their region's assignments"
  on public.assignments for all to authenticated
  using (private.manages_region(private.service_region(service_id)))
  with check (private.manages_region(private.service_region(service_id)));

drop policy "Active people can read assignment categories" on public.assignment_categories;
drop policy "Admins manage assignment categories" on public.assignment_categories;
create policy "People can read their regions' assignment categories"
  on public.assignment_categories for select to authenticated
  using (
    private.in_region(private.service_region(
      (select service_id from public.assignments where id = assignment_id)
    ))
  );
create policy "Region admins manage their region's assignment categories"
  on public.assignment_categories for all to authenticated
  using (
    private.manages_region(private.service_region(
      (select service_id from public.assignments where id = assignment_id)
    ))
  )
  with check (
    private.manages_region(private.service_region(
      (select service_id from public.assignments where id = assignment_id)
    ))
  );

drop policy "People can read handoffs for their teams" on public.handoffs;
create policy "People can read handoffs for their teams"
  on public.handoffs for select to authenticated
  using (
    private.in_region(private.service_region(service_id))
    and (
      (select private.current_app_role()) in ('admin', 'member')
      or exists (
        select 1 from public.team_members tm
        where tm.team_id = handoffs.team_id
          and tm.profile_id = (select auth.uid())
      )
    )
  );

-- Region admins can invite people to their own region as members or viewers.
drop policy "Admins manage invites" on public.invites;
create policy "Admins manage invites"
  on public.invites for all to authenticated
  using (
    (select private.is_admin())
    or (region_id is not null and private.manages_region(region_id) and role <> 'admin')
  )
  with check (
    (select private.is_admin())
    or (
      region_id is not null
      and private.manages_region(region_id)
      and role <> 'admin'
      and not region_admin
    )
  );

-- Share links: overall admins for anything; region admins for their region.
drop policy "Admins manage share links" on public.share_links;
create policy "Admins manage share links"
  on public.share_links for all to authenticated
  using (
    (select private.is_admin())
    or (region_id is not null and private.manages_region(region_id))
  )
  with check (
    (select private.is_admin())
    or (
      region_id is not null
      and private.manages_region(region_id)
      and (service_id is null or private.service_region(service_id) = region_id)
    )
  );
