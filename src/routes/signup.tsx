import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { Loader2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { appOrigin } from "@/lib/app-url";
import { PasswordInput } from "@/components/PasswordInput";
import { GoogleSignInButton, AuthDivider } from "@/components/GoogleSignInButton";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords don't match");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${appOrigin()}/auth/callback`,
        data: { full_name: name },
      },
    });
    if (error) {
      setLoading(false);
      return toast.error(friendlyError(error));
    }
    try {
      localStorage.setItem("famkart:email", email);
    } catch {
      /* ignore storage errors */
    }
    // If email confirmation is OFF, signUp already returns a session. If it's ON,
    // try an immediate sign-in; if that's blocked, send them to confirm + login.
    if (!data.session) {
      const { data: si } = await supabase.auth.signInWithPassword({ email, password });
      if (!si.session) {
        setLoading(false);
        toast.success("Account created! Check your email to confirm, then sign in.");
        return navigate({ to: "/login" });
      }
    }
    setLoading(false);
    toast.success("Account created!");
    navigate({ to: "/onboarding" });
  };

  return (
    <main className="relative grid min-h-screen place-items-center px-4">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/3 left-1/2 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-secondary/15 blur-[120px]" />
      </div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <ShoppingCart className="h-5 w-5" style={{ color: "#3ECF8E" }} />
          <span className="text-lg font-bold text-white">FamKart</span>
        </Link>
        <div className="glass rounded-2xl p-8">
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Start organizing your home in minutes.</p>
          <div className="mt-6">
            <GoogleSignInButton label="Sign up with Google" />
            <AuthDivider />
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@home.com" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <PasswordInput required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
            <div className="space-y-2">
              <Label>Confirm password</Label>
              <PasswordInput required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" />
              {confirm && password !== confirm && (
                <p className="text-xs text-destructive">Passwords don't match</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account? <Link to="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </motion.div>
    </main>
  );
}
