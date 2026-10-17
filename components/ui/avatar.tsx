import { cn } from "@/lib/cn";

// A few soft pastel hues, readable in light and dark, so a row of people is easy to tell apart at a glance.
const TINTS = [
  "bg-[#dbe6ff] text-[#1d3a8a]",
  "bg-[#d3f1e8] text-[#0f5a47]",
  "bg-[#ffe8c7] text-[#7a4510]",
  "bg-[#fde0ee] text-[#86204f]",
  "bg-[#e4e0ff] text-[#3b2f99]",
];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

function tintFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

const SIZES = {
  sm: "h-6 w-6 text-[0.625rem]",
  md: "h-8 w-8 text-caption",
  lg: "h-10 w-10 text-body-sm",
};

/** A person shown as their initials on a tint that is always the same for them. */
export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold",
        SIZES[size],
        tintFor(name),
        className,
      )}
    >
      <span aria-hidden>{initials(name)}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}

/** Overlapping avatars, with "+3" when there are more than fit. */
export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((name, index) => (
        // Earlier people sit on top, so the overlap never covers initials.
        <span
          key={name}
          style={{ zIndex: shown.length - index }}
          className="relative -ml-1 rounded-full ring-2 ring-surface first:ml-0"
        >
          <Avatar name={name} />
        </span>
      ))}
      {extra > 0 ? (
        <span className="-ml-1 inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-surface-strong px-1.5 text-caption font-bold text-ink-soft ring-2 ring-surface">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
