import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, RefreshCw, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { BackButton } from "@/components/BackButton";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

function SettingsPage() {
  const { profile, family, user, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [famName, setFamName] = useState(family?.name ?? "");
  const [members, setMembers] = useState<{ id: string; full_name: string | null }[]>([]);

  useEffect(() => { setName(profile?.full_name ?? ""); setFamName(family?.name ?? ""); }, [profile, family]);
  useEffect(() => {
    if (!family) return;
    supabase.from("profiles").select("id,full_name").eq("family_id", family.id).then(({ data }) => setMembers(data ?? []));
  }, [family]);

  const saveProfile = async () => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ full_name: name }).eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Profile updated"); await refresh();
  };
  const saveFamily = async () => {
    if (!family) return;
    const { error } = await supabase.from("families").update({ name: famName }).eq("id", family.id);
    if (error) return toast.error(error.message);
    toast.success("Family updated"); await refresh();
  };
  const regenerate = async () => {
    if (!family) return;
    const { data } = await supabase.rpc("generate_invite_code");
    if (!data) return;
    await supabase.from("families").update({ invite_code: data as string }).eq("id", family.id);
    toast.success("New invite code"); await refresh();
  };
  const leave = async () => {
    if (!user) return;
    if (!confirm("Leave this family?")) return;
    await supabase.from("profiles").update({ family_id: null }).eq("id", user.id);
    await refresh(); navigate({ to: "/onboarding" });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <BackButton label="Back" />
      <header>
        <h1 className="text-3xl font-bold">Settings</h1>
      </header>

      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold">Profile</h2>
        <div className="space-y-2"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-2"><Label>Email</Label><Input value={user?.email ?? ""} disabled /></div>
        <Button onClick={saveProfile}>Save profile</Button>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold">Family</h2>
        <div className="space-y-2"><Label>Family name</Label><Input value={famName} onChange={(e) => setFamName(e.target.value)} /></div>
        <Button onClick={saveFamily}>Save</Button>
        <div className="border-t border-border pt-4">
          <Label>Invite code</Label>
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded-md bg-primary/10 px-4 py-2 font-mono text-lg text-primary">{family?.invite_code}</code>
            <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(family?.invite_code ?? ""); toast.success("Copied"); }}><Copy className="h-4 w-4" /></Button>
            <Button size="icon" variant="outline" onClick={regenerate} title="Regenerate"><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="border-t border-border pt-4">
          <Label>Members</Label>
          <ul className="mt-2 space-y-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-md border border-border bg-accent/30 px-3 py-2 text-sm">
                <span>{m.full_name ?? "Member"} {m.id === family?.created_by && <span className="ml-2 text-xs text-primary">admin</span>}</span>
                {m.id === user?.id && <span className="text-xs text-muted-foreground">You</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 space-y-3">
        <h2 className="font-semibold text-destructive">Danger zone</h2>
        <Button variant="destructive" onClick={leave}><LogOut className="mr-2 h-4 w-4" /> Leave family</Button>
        <Button variant="outline" onClick={async () => { await signOut(); navigate({ to: "/" }); }}>Sign out</Button>
      </section>
    </div>
  );
}