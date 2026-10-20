-- An invite can put someone in several regions at once (a photographer who
-- serves Metro Heights and OC), and make them region admin of some of them.
--
-- invites.region_id and invites.region_admin become two lists:
--   region_ids        the regions they join
--   region_admin_ids  the ones among those they run

alter table public.invites
  add column region_ids uuid[] not null default '{}',
  add column region_admin_ids uuid[] not null default '{}';

update public.invites
set region_ids = array[region_id],
    region_admin_ids = case when region_admin then array[region_id] else '{}' end
where region_id is not null;

-- With only one region, invites still go into it without anyone choosing.
create function private.only_region_list()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.only_region() is null then '{}'::uuid[] else array[private.only_region()] end
$$;

alter table public.invites alter column region_ids set default private.only_region_list();

revoke all on function private.only_region_list() from public, anon;
grant execute on function private.only_region_list() to authenticated, service_role;

-- Region admins may invite into regions they run, as members or viewers,
-- and may not hand out region admin.
drop policy "Admins manage invites" on public.invites;

create function private.manages_all_regions(target_region_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select cardinality(target_region_ids) > 0
    and not exists (
      select 1 from unnest(target_region_ids) as region_id
      where not private.manages_region(region_id)
    )
$$;

revoke all on function private.manages_all_regions(uuid[]) from public, anon;
grant execute on function private.manages_all_regions(uuid[]) to authenticated;

create policy "Admins manage invites"
  on public.invites for all to authenticated
  using (
    (select private.is_admin())
    or (private.manages_all_regions(region_ids) and role <> 'admin')
  )
  with check (
    (select private.is_admin())
    or (
      private.manages_all_regions(region_ids)
      and role <> 'admin'
      and cardinality(region_admin_ids) = 0
    )
  );

alter table public.invites drop column region_id, drop column region_admin;

-- New people join every region they were invited to.
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

  -- Only regions that still exist: a stale ID must not block signing in.
  insert into public.region_members (region_id, profile_id, is_region_admin)
  select r.id, new.id, r.id = any (invite.region_admin_ids) and invite.role = 'member'
  from public.regions r
  where r.id = any (invite.region_ids)
  on conflict do nothing;

  update public.invites set accepted_at = now() where email = invite.email;

  return new;
end;
$$;
