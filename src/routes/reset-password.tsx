import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
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
  const score = useMemo(() => strength(pw), [pw]);
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = ["bg-muted", "bg-destructive", "bg-warning", "bg-yellow-500", "bg-primary"];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== confirm) return toast.error("Passwords don't match");
    if (score < 2) return toast.error("Please choose a stronger password");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated! Redirecting to login…");
    setTimeout(() => navigate({ to: "/login" }), 800);
  };

  return (
    <main className="relative grid min-h-screen place-items-center px-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <ShoppingCart className="h-5 w-5" style={{ color: "#3ECF8E" }} />
          <span className="text-lg font-bold text-white">FamKart</span>
        </div>
        <div className="glass rounded-2xl p-8">
          <h1 className="text-2xl font-bold">Create new password</h1>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>New password</Label>
              <PasswordInput required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" />
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
              <PasswordInput required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" />
              {confirm && pw !== confirm && <p className="text-xs text-destructive">Passwords don't match</p>}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </Button>
          </form>
        </div>
      </motion.div>
    </main>
  );
}
