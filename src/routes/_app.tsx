import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/layout/AppShell";
import { QuickAddFab } from "@/components/QuickAddFab";
import { useEffect as useEffectRT } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { requeueRecurringItems } from "@/lib/recurring";

export const Route = createFileRoute("/_app")({ component: AppLayout });

function AppLayout() {
  const { user, profile, loading, family } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
    else if (!profile?.family_id) navigate({ to: "/onboarding" });
  }, [user, profile, loading, navigate]);

  // Realtime broadcast notifications
  useEffectRT(() => {
    if (!family || !user) return;
    const ch = supabase
      .channel(`family:${family.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "items", filter: `family_id=eq.${family.id}` }, (payload) => {
        const row = payload.new as { name: string; created_by: string };
        if (row.created_by !== user.id) toast.info(`New item: ${row.name}`);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [family, user]);

  // Re-queue recurring items whose interval has elapsed
  useEffect(() => {
    if (!family) return;
    requeueRecurringItems(family.id);
  }, [family]);

  if (loading || !user || !profile?.family_id) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
      <QuickAddFab />
    </AppShell>
  );
}