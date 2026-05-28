import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({ component: AuthCallback });

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      try {
        let { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Auth callback error:", error);
          navigate({ to: "/login" });
          return;
        }
        if (!session) {
          const { data, error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(window.location.href);
          if (exchangeError || !data.session) {
            // Last-ditch: poll briefly for hash-based implicit flow handled by AuthProvider.
            for (let i = 0; i < 10 && !session; i++) {
              await new Promise((r) => setTimeout(r, 150));
              const { data: s } = await supabase.auth.getSession();
              session = s.session;
            }
            if (!session) {
              navigate({ to: "/login" });
              return;
            }
          } else {
            session = data.session;
          }
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const meta = user.user_metadata ?? {};
          await supabase.from("profiles").upsert(
            {
              id: user.id,
              full_name: meta.full_name ?? meta.name ?? null,
              avatar_url: meta.avatar_url ?? meta.picture ?? null,
            },
            { onConflict: "id" },
          );

          const { data: profile } = await supabase
            .from("profiles")
            .select("family_id")
            .eq("id", user.id)
            .maybeSingle();

          toast.success("Signed in!");
          navigate({ to: profile?.family_id ? "/dashboard" : "/onboarding" });
        } else {
          navigate({ to: "/login" });
        }
      } catch (err) {
        console.error("Callback failed:", err);
        navigate({ to: "/login" });
      }
    };
    run();
  }, [navigate]);

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" style={{ color: "#3ECF8E" }} />
          <span className="text-lg font-bold text-white">FamKart</span>
        </div>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Completing sign-in…</p>
      </div>
    </main>
  );
}