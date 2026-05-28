export function friendlyError(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const message =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : "";

  // Log raw details for debugging; never surface them in the UI.
  if (message) {
    // eslint-disable-next-line no-console
    console.debug("[error]", message);
  }

  // Allow a small allowlist of already user-friendly auth messages through.
  const safePrefixes = [
    "Invalid login",
    "Email not confirmed",
    "User already registered",
    "Password should be",
    "Signups not allowed",
    "Email rate limit",
    "Token has expired",
    "New password should be different",
  ];
  if (safePrefixes.some((p) => message.startsWith(p))) return message;

  return fallback;
}