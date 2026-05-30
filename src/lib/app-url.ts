// Canonical FamKart origin for auth redirects.
//
// Supabase bakes the `redirectTo` we pass into email links and OAuth returns. If we
// derive it from window.location.origin, a flow started on the Lovable preview
// (*.lovable.app) sends the user back to Lovable instead of the deployed app. So we
// pin auth redirects to the production URL — except on localhost, where we keep the
// local origin so dev still works. Override with VITE_APP_URL if the domain changes.
const PROD_URL =
  (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, "") ??
  "https://fam-kart.vercel.app";

export function appOrigin(): string {
  if (typeof window === "undefined") return PROD_URL;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return window.location.origin;
  return PROD_URL;
}
