import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Plus, Users, Loader2, ShoppingCart } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/onboarding")({ component: OnboardingPage });

function OnboardingPage() {
  const navigate = useNavigate();
  const { user, profile, loading, refresh } = useAuth();
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [familyName, setFamilyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
    else if (profile?.family_id) navigate({ to: "/dashboard" });
  }, [user, profile, loading, navigate]);

  const createFamily = async () => {
    if (!user || !familyName.trim()) return;
    setBusy(true);
    // SECURITY DEFINER RPC creates the family and attaches our profile in one
    // transaction, avoiding the families RLS select-after-insert chicken-egg.
    const { data, error } = await (supabase.rpc as any)("create_family", {
      _name: familyName.trim(),
    });
    setBusy(false);
    if (error || !data) return toast.error(friendlyError(error, "Could not create family"));
    const fam = Array.isArray(data) ? data[0] : data;
    await refresh();
    toast.success(`Welcome to ${fam.name}!`);
    navigate({ to: "/dashboard" });
  };

  const joinFamily = async () => {
    if (!user || inviteCode.length !== 6) return;
    setBusy(true);
    // SECURITY DEFINER RPC validates the code and attaches our profile in one
    // transaction (no direct families/profiles write from the client).
    const { data, error } = await (supabase.rpc as any)("join_family", {
      _code: inviteCode.toUpperCase(),
    });
    setBusy(false);
    if (error) {
      if (String((error as { message?: string }).message ?? "").includes("INVALID_CODE")) {
        return toast.error("Invalid invite code");
      }
      return toast.error(friendlyError(error, "Could not join family"));
    }
    const fam = Array.isArray(data) ? data[0] : data;
    if (!fam) return toast.error("Invalid invite code");
    await refresh();
    toast.success(`Joined ${fam.name}!`);
    navigate({ to: "/dashboard" });
  };

  return (
    <main className="relative grid min-h-screen place-items-center px-4">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/3 left-1/2 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
      </div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-center gap-2">
          <ShoppingCart className="h-6 w-6" style={{ color: "#3ECF8E" }} />
          <span className="text-lg font-bold text-white">FamKart</span>
        </div>
        {mode !== "choose" && (
          <div className="mb-3"><BackButton label="Back" /></div>
        )}

        {mode === "choose" && (
          <div className="glass rounded-2xl p-8 text-center">
            <h1 className="text-2xl font-bold">Set up your household</h1>
            <p className="mt-1 text-sm text-muted-foreground">Create a new family or join one with an invite code.</p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <button onClick={() => setMode("create")} className="card-glow rounded-xl border border-border bg-card p-6 text-left">
                <Plus className="h-6 w-6 text-primary" />
                <h3 className="mt-3 font-semibold">Create a family</h3>
                <p className="mt-1 text-sm text-muted-foreground">You'll get an invite code to share.</p>
              </button>
              <button onClick={() => setMode("join")} className="card-glow rounded-xl border border-border bg-card p-6 text-left">
                <Users className="h-6 w-6 text-secondary" />
                <h3 className="mt-3 font-semibold">Join a family</h3>
                <p className="mt-1 text-sm text-muted-foreground">Enter the 6-character code.</p>
              </button>
            </div>
          </div>
        )}

        {mode === "create" && (
          <div className="glass rounded-2xl p-8">
            <h1 className="text-2xl font-bold">Name your household</h1>
            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label>Family name</Label>
                <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="The Gupta Family" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMode("choose")}>Back</Button>
                <Button onClick={createFamily} disabled={busy || !familyName.trim()} className="flex-1">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create family"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {mode === "join" && (
          <div className="glass rounded-2xl p-8">
            <h1 className="text-2xl font-bold">Enter invite code</h1>
            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label>6-character code</Label>
                <Input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="ABC123"
                  className="text-center text-2xl tracking-widest uppercase"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMode("choose")}>Back</Button>
                <Button onClick={joinFamily} disabled={busy || inviteCode.length !== 6} className="flex-1">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join family"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </main>
  );
}