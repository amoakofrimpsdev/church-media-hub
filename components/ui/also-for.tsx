/**
 * "Also for": the other regions a joint service is for (a combined service).
 * People in those regions see it and can upload to it; the main region still
 * runs it and keeps its files. Shown only when there is more than one region.
 */
export function AlsoForRegions({
  regions,
  checked = [],
}: {
  regions: { id: string; name: string }[];
  checked?: string[];
}) {
  if (regions.length === 0) return null;
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-body-sm font-bold text-ink">Also for (a joint service)</legend>
      <p className="mb-1 text-caption text-muted">
        Tick other regions taking part. Their people see it and can upload to it.
      </p>
      <div className="flex flex-wrap gap-2">
        {regions.map((region) => (
          <label
            key={region.id}
            className="flex items-center gap-2 rounded-full bg-surface-soft px-3 py-2 text-body-sm text-ink"
          >
            <input
              type="checkbox"
              name={`also:${region.id}`}
              defaultChecked={checked.includes(region.id)}
              className="h-4 w-4 accent-primary"
            />
            {region.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The regions ticked under "Also for", leaving out the main one. */
export function readAlsoFor(
  formData: FormData,
  regionIds: string[],
  mainRegionId: string,
): string[] {
  return regionIds.filter(
    (id) => id !== mainRegionId && formData.get(`also:${id}`) === "on",
  );
}
