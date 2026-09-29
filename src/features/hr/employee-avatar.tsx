import { cn } from "@/lib/utils";

/** Employee photo, or initials when there is none. The photo is served by the authenticated API. */
export function EmployeeAvatar({
  name,
  photoUrl,
  size = "sm",
}: {
  name: string;
  photoUrl: string | null;
  size?: "sm" | "lg";
}) {
  const box = size === "lg" ? "size-20 text-xl" : "size-8 text-xs";
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- private, per-company image served by our own API
      <img
        src={photoUrl}
        alt={size === "lg" ? `Photo of ${name}` : ""}
        className={cn(box, "shrink-0 rounded-full object-cover")}
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className={cn(box, "flex shrink-0 items-center justify-center rounded-full bg-muted font-medium")}
    >
      {initials}
    </span>
  );
}
