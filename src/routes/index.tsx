import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Home, Users, Sparkles, ShoppingCart } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (user && profile?.family_id) navigate({ to: "/dashboard" });
    else if (user) navigate({ to: "/onboarding" });
  }, [user, profile, loading, navigate]);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-primary/20 blur-[140px]" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-secondary/20 blur-[140px]" />
      </div>
      <nav className="flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
            <Home className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">NestList</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => navigate({ to: "/login" })}>Log in</Button>
          <Button onClick={() => navigate({ to: "/signup" })}>Get started</Button>
        </div>
      </nav>

      <section className="mx-auto flex max-w-5xl flex-col items-center px-6 pt-20 pb-32 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur"
        >
          <Sparkles className="h-3 w-3 text-primary" />
          Realtime family household management
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-5xl font-bold leading-tight tracking-tight text-transparent md:text-7xl"
        >
          Your household,<br/>perfectly in sync.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-6 max-w-xl text-lg text-muted-foreground"
        >
          Track groceries, supplies, budgets, and chores together. Everyone sees
          updates in real time. Built for modern families.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <Button size="lg" className="pulse-glow" onClick={() => navigate({ to: "/signup" })}>
            Create your family
          </Button>
          <Button size="lg" variant="outline" onClick={() => navigate({ to: "/login" })}>
            <Users className="mr-2 h-4 w-4" /> Join with code
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-20 grid w-full grid-cols-1 gap-4 md:grid-cols-3"
        >
          {[
            { icon: ShoppingCart, title: "Shared lists", desc: "10 categories ready to go." },
            { icon: Sparkles, title: "Realtime sync", desc: "See updates as they happen." },
            { icon: Users, title: "Family budget", desc: "Track spend per category." },
          ].map((f) => (
            <div key={f.title} className="glass rounded-xl p-5 text-left card-glow">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </motion.div>
      </section>
    </main>
  );
}
