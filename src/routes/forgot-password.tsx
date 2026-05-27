import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, ShoppingCart, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { BackButton } from "@/components/BackButton";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordPage });

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setSent(true);
  };

  return (
    <main className="relative grid min-h-screen place-items-center px-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <ShoppingCart className="h-5 w-5" style={{ color: "#3ECF8E" }} />
          <span className="text-lg font-bold text-white">FamKart</span>
        </Link>
        <div className="glass rounded-2xl p-8">
          <BackButton label="Back" />
          {!sent ? (
            <>
              <h1 className="mt-2 text-2xl font-bold">Reset your password</h1>
              <p className="mt-1 text-sm text-muted-foreground">Enter your email and we'll send you a reset link.</p>
              <form onSubmit={submit} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@home.com" />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
                </Button>
              </form>
            </>
          ) : (
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-4">
              <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
              <h2 className="mt-3 text-xl font-bold">Check your inbox!</h2>
              <p className="mt-1 text-sm text-muted-foreground">A reset link has been sent to {email}</p>
              <Link to="/login" className="mt-6 inline-block text-sm text-primary hover:underline">Back to login</Link>
            </motion.div>
          )}
        </div>
      </motion.div>
    </main>
  );
}
