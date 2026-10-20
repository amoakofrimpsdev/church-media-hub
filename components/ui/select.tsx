import type { SelectHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "@/lib/cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  /** Keep the label for screen readers but hide it visually. */
  hideLabel?: boolean;
};

export function Select({
  label,
  hideLabel,
  className,
  id,
  children,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label
        htmlFor={selectId}
        className={cn(
          "text-body-sm font-bold text-ink",
          hideLabel && "sr-only",
        )}
      >
        {label}
      </label>
      <select
        id={selectId}
        className={cn(
          "h-12 w-full min-w-0 truncate rounded-md border border-hairline bg-surface-soft px-3 text-body text-ink transition-colors hover:border-muted focus:border-primary disabled:text-muted-soft",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
