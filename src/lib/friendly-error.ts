type Mapping = { match: string; message: string };

// Map known Supabase / auth error strings to friendly copy. We never surface raw
// Supabase messages to users — anything unmatched falls back to a generic line.
const MAPPINGS: Mapping[] = [
  { match: "invalid login credentials", message: "Incorrect email or password" },
  { match: "email not confirmed", message: "Please verify your email first" },
  { match: "user already registered", message: "An account with this email already exists" },
  { match: "password should be at least", message: "Password must be at least 8 characters" },
  { match: "new password should be different", message: "Your new password must be different from your old one" },
  // Rate limiting (several Supabase variants)
  { match: "for security purposes", message: "Too many requests. Please wait a few minutes." },
  { match: "email rate limit", message: "Too many requests. Please wait a few minutes." },
  { match: "over_email_send_rate_limit", message: "Too many requests. Please wait a few minutes." },
  { match: "rate limit", message: "Too many requests. Please wait a few minutes." },
  { match: "too many requests", message: "Too many requests. Please wait a few minutes." },
];

export function friendlyError(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const raw =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : typeof err === "string"
        ? err
        : "";

  // Log raw details for debugging; never surface them in the UI.
  if (raw) {
    // eslint-disable-next-line no-console
    console.debug("[error]", raw);
  }

  const lower = raw.toLowerCase();
  for (const m of MAPPINGS) {
    if (lower.includes(m.match)) return m.message;
  }
  return fallback;
}
