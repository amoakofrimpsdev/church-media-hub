import Image from "next/image";
import { cn } from "@/lib/cn";

/** The RCW LA Media logo, cropped to its circle. */
export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/logo.jpg"
      alt=""
      width={size}
      height={size}
      priority
      className={cn("shrink-0 rounded-full bg-white object-cover ring-1 ring-hairline", className)}
    />
  );
}
