import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { Loader2, ShoppingCart, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";

export const Route = createFileRoute("/reset-password")({ component: ResetPasswordPage });

function strength(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Z]/.test(p)) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return s;
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY (or SIGNED_IN) once it parses the token from
    // the email link. If neither arrives within 3s, the link is expired/invalid.
    let ok = false;
    const timer = setTimeout(() => {
      if (!ok) setExpired(true);
    }, 3000);
    const done = () => {
      ok = true;
      clearTimeout(timer);
      setExpired(false);
      setReady(true);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) done();
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) done();
    });
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const score = useMemo(() => strength(pw), [pw]);
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = ["bg-muted", "bg-destructive", "bg-warning", "bg-yellow-500", "bg-primary"];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (pw !== confirm) return setErr("Passwords don't match");
    if (score < 2) return setErr("Please choose a stronger password");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) return setErr(friendlyError(error));
    toast.success("Password updated!");
    setTimeout(() => navigate({ to: "/login" }), 2000);
  };

  if (expired && !ready) {
    return (
      <main className="relative grid min-h-screen place-items-center px-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-center gap-2">
            <ShoppingCart className="h-5 w-5" style={{ color: "#3ECF8E" }} />
            <span className="text-lg font-bold text-white">FamKart</span>
          </div>
          <div className="glass rounded-2xl p-8 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-3 text-xl font-bold">Link expired or invalid</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This link has expired or is invalid. Request a new one.
            </p>
            <Button className="mt-6 w-full" onClick={() => navigate({ to: "/forgot-password" })}>
              Request a new link
            </Button>
          </div>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="relative grid min-h-screen place-items-center px-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <ShoppingCart className="h-5 w-5" style={{ color: "#3ECF8E" }} />
          <span className="text-lg font-bold text-white">FamKart</span>
        </div>
        <div className="glass rounded-2xl p-8">
          <h1 className="text-2xl font-bold">Create new password</h1>
          {!ready && (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying your reset link…
            </p>
          )}
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>New password</Label>
              <PasswordInput required minLength={8} value={pw} onChange={(e) => { setPw(e.target.value); setErr(null); }} placeholder="At least 8 characters" />
              {pw && (
                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className={`h-full transition-all ${colors[score]}`} style={{ width: `${(score / 4) * 100}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{labels[score]} — 8+ chars, uppercase, number, special character</p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Confirm password</Label>
              <PasswordInput required value={confirm} onChange={(e) => { setConfirm(e.target.value); setErr(null); }} placeholder="Repeat password" />
              {confirm && pw !== confirm && <p className="text-xs text-destructive">Passwords don't match</p>}
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" disabled={loading || !ready}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </Button>
          </form>
        </div>
      </motion.div>
    </main>
  );
}
