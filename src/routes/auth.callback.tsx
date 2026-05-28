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
      // Allow AuthProvider's consumeOAuthTokens to run first if tokens are in URL.
      // Then read the session and route based on family membership.
      let attempts = 0;
      let session = null as Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"];
      while (attempts < 20 && !session) {
        const { data } = await supabase.auth.getSession();
        session = data.session;
        if (session) break;
        await new Promise((r) => setTimeout(r, 150));
        attempts++;
      }
      if (!session) {
        toast.error("Sign-in failed. Please try again.");
        navigate({ to: "/login" });
        return;
      }

      const user = session.user;
      // Upsert profile from Google metadata.
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