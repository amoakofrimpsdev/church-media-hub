import type { Metadata } from "next";
import { PeopleView } from "@/components/admin/people-view";
import { getAllRegions, requireManager } from "@/lib/regions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage() {
  const { profile: admin, regions: managed } = await requireManager();
  const supabase = await createClient();

  const [people, invites, teams, memberships, allRegions, regionMembers] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name"),
    supabase
      .from("invites")
      .select("*")
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("teams").select("*").order("name"),
    supabase.from("team_members").select("*"),
    getAllRegions(),
    supabase.from("region_members").select("*"),
  ]);
  const regionName = new Map(allRegions.map((region) => [region.id, region.name]));
  const severalRegions = allRegions.filter((region) => region.is_active).length > 1;
  const placesByPerson = new Map<string, Map<string, boolean>>();
  for (const row of regionMembers.data ?? []) {
    const places = placesByPerson.get(row.profile_id) ?? new Map<string, boolean>();
    places.set(row.region_id, row.is_region_admin);
    placesByPerson.set(row.profile_id, places);
  }
  const failed = people.error ?? invites.error ?? teams.error ?? memberships.error;
  if (failed) throw new Error(`Could not load people: ${failed.message}`);

  const teamName = new Map((teams.data ?? []).map((team) => [team.id, team.name]));
  const teamsByPerson = new Map<string, string[]>();
  for (const membership of memberships.data ?? []) {
    const name = teamName.get(membership.team_id);
    if (!name) continue;
    const names = teamsByPerson.get(membership.profile_id) ?? [];
    names.push(name);
    teamsByPerson.set(membership.profile_id, names);
  }

  return (
    <PeopleView
      data={{
        teams: teams.data ?? [],
        invites: (invites.data ?? []).map((invite) => ({
          email: invite.email,
          role: invite.role,
          teamName: invite.team_id ? (teamName.get(invite.team_id) ?? null) : null,
          regionName:
            severalRegions && invite.region_id ? (regionName.get(invite.region_id) ?? null) : null,
        })),
        regions: managed.map(({ id, name }) => ({ id, name })),
        isAdmin: admin.role === "admin",
        people: (people.data ?? []).map((person) => ({
          id: person.id,
          name: person.full_name,
          email: person.email,
          role: person.role,
          active: person.active,
          isSelf: person.id === admin.id,
          teams: teamsByPerson.get(person.id) ?? [],
          telegramLinked: person.telegram_user_id !== null,
          regionNames: severalRegions
            ? [...(placesByPerson.get(person.id)?.keys() ?? [])].flatMap(
                (id) => regionName.get(id) ?? [],
              )
            : [],
          regions: managed.map((region) => ({
            id: region.id,
            name: region.name,
            member: placesByPerson.get(person.id)?.has(region.id) ?? false,
            runs: placesByPerson.get(person.id)?.get(region.id) ?? false,
          })),
        })),
      }}
    />
  );
}
