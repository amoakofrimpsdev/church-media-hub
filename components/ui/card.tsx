import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** A white card on the pale page, lifted by a soft shadow. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg bg-surface shadow-card p-4 tablet:p-6",
        className,
      )}
      {...props}
    />
  );
}
