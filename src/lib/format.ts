export const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

export const fmtDate = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
};

export const greet = (name?: string | null) => {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${name ?? "friend"} 👋`;
};