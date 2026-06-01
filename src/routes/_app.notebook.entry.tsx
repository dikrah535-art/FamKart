import { createFileRoute, redirect } from "@tanstack/react-router";

// Diary editing now lives on the dashboard. Keep this route as a redirect so
// any old links / bookmarks land in the right place.
export const Route = createFileRoute("/_app/notebook/entry")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
