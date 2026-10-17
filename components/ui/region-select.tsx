import { Select } from "@/components/ui/select";

export type RegionOption = { id: string; name: string };

/**
 * Which region something belongs to. With one region to choose from there is
 * nothing to ask, so it is sent along without a field.
 */
export function RegionSelect({
  regions,
  name = "region",
  defaultValue,
  label = "Region",
}: {
  regions: RegionOption[];
  name?: string;
  defaultValue?: string;
  label?: string;
}) {
  if (regions.length === 0) return null;
  if (regions.length === 1) {
    return <input type="hidden" name={name} value={regions[0].id} />;
  }
  return (
    <Select label={label} name={name} defaultValue={defaultValue ?? ""} required>
      <option value="" disabled>
        Choose a region
      </option>
      {regions.map((region) => (
        <option key={region.id} value={region.id}>
          {region.name}
        </option>
      ))}
    </Select>
  );
}
