import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // The Lovable config injects @cloudflare/vite-plugin on `build`, which forces a
  // Cloudflare Worker output (dist/server + wrangler.json) and an asset-only
  // dist/client with no index.html. Disabling it lets us emit a plain static build.
  cloudflare: false,
  tanstackStart: {
    // FamKart has no server functions and is fully client-side Supabase, so we ship
    // a client-only SPA. TanStack Start prerenders a static shell that hydrates and
    // does client-side routing for every route. outputPath "/index" makes the shell
    // emit as dist/client/index.html (the default is "/_shell" -> _shell.html).
    spa: { enabled: true, prerender: { outputPath: "/index" } },
    server: { entry: "server" },
  },
});
