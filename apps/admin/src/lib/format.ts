export const birr = (value: number) =>
  new Intl.NumberFormat("en-ET", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/** +251986680094 reads more easily as +251 98 668 0094. */
export function prettyPhone(phone: string) {
  const match = /^\+251(\d{2})(\d{3})(\d{4})$/.exec(phone);
  return match ? `+251 ${match[1]} ${match[2]} ${match[3]}` : phone;
}

/** Two initials for the avatar chip in the table. */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}
