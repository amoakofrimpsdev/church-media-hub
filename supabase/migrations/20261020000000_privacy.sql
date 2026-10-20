-- Privacy between regions.
--
-- Profiles hold people's email addresses and Telegram IDs. Until now any
-- signed-in person could read every profile, so a viewer in one region could
-- list the emails of everyone in every other region. Now:
--   • members and viewers see people who share a region with them, the super
--     admins (who appear across every region), and themselves;
--   • super admins and region admins see everyone, because adding an existing
--     person to a region means finding them first.
-- Who is in which region follows the same rule.

create function private.runs_a_region()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or (
    private.current_app_role() = 'member'
    and exists (
      select 1 from public.region_members
      where profile_id = (select auth.uid()) and is_region_admin
    )
  )
$$;

create function private.can_see_person(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_app_role() is not null and (
    target_profile_id = (select auth.uid())
    or private.runs_a_region()
    or exists (
      select 1 from public.profiles
      where id = target_profile_id and role = 'admin'
    )
    or exists (
      select 1
      from public.region_members mine
      join public.region_members theirs on theirs.region_id = mine.region_id
      where mine.profile_id = (select auth.uid())
        and theirs.profile_id = target_profile_id
    )
  )
$$;

revoke all on function private.runs_a_region(), private.can_see_person(uuid) from public, anon;
grant execute on function private.runs_a_region(), private.can_see_person(uuid) to authenticated;

drop policy "Active people can read profiles" on public.profiles;
create policy "People can read profiles they share a region with"
  on public.profiles for select to authenticated
  using (private.can_see_person(id));

drop policy "Active people can read region members" on public.region_members;
create policy "People can read their regions' members"
  on public.region_members for select to authenticated
  using ((select private.runs_a_region()) or private.in_region(region_id));
