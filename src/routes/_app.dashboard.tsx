import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Package, TrendingDown, Wallet, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { greet, inr } from "@/lib/format";

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard });

type Item = {
  id: string; name: string; status: string; priority: string;
  category_id: string | null; assigned_to: string | null;
  estimated_cost: number; created_at: string;
};
type Cat = { id: string; name: string; icon: string; color: string };

function Dashboard() {
  const { profile, family, user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [purchasedTotal, setPurchasedTotal] = useState(0);

  const load = async () => {
    if (!family) return;
    const [it, ct, ph] = await Promise.all([
      supabase.from("items").select("id,name,status,priority,category_id,assigned_to,estimated_cost,created_at").eq("family_id", family.id).order("created_at", { ascending: false }),
      supabase.from("categories").select("id,name,icon,color").eq("family_id", family.id),
      supabase.from("purchase_history").select("cost,purchased_at").eq("family_id", family.id).gte("purchased_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    ]);
    setItems((it.data as Item[]) ?? []);
    setCats((ct.data as Cat[]) ?? []);
    setPurchasedTotal((ph.data ?? []).reduce((s, r: { cost: number | null }) => s + (Number(r.cost) || 0), 0));
  };

  useEffect(() => { load(); }, [family]);

  useEffect(() => {
    if (!family) return;
    const ch = supabase.channel(`dash:${family.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `family_id=eq.${family.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [family]);

  const needed = items.filter((i) => i.status === "needed").length;
  const urgent = items.filter((i) => i.priority === "urgent" && i.status !== "stocked").length;
  const low = items.filter((i) => i.status === "low_stock").length;
  const budgetUsed = family?.monthly_budget ? Math.round((purchasedTotal / Number(family.monthly_budget)) * 100) : 0;

  const stats = [
    { label: "Items needed", value: needed, icon: Package, accent: "text-primary" },
    { label: "Urgent", value: urgent, icon: AlertTriangle, accent: "text-destructive" },
    { label: "Low stock", value: low, icon: TrendingDown, accent: "text-warning" },
    { label: "Budget used", value: family?.monthly_budget ? `${budgetUsed}%` : inr(purchasedTotal), icon: Wallet, accent: "text-secondary" },
  ];

  const urgentItems = items.filter((i) => i.priority === "urgent" && i.status !== "stocked").slice(0, 8);
  const myItems = items.filter((i) => i.assigned_to === user?.id && i.status !== "stocked").slice(0, 5);
  const recent = items.slice(0, 5);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{greet(profile?.full_name?.split(" ")[0])}</h1>
        <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="card-glow rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <s.icon className={`h-4 w-4 ${s.accent}`} />
            </div>
            <p className="mt-2 text-2xl font-bold">{s.value}</p>
          </motion.div>
        ))}
      </section>

      {urgentItems.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Urgent items</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {urgentItems.map((i) => (
              <div key={i.id} className="min-w-[200px] rounded-xl border border-destructive/40 bg-destructive/5 p-4">
                <span className="inline-flex rounded-full bg-destructive/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-destructive">Urgent</span>
                <p className="mt-2 font-semibold">{i.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{i.status.replace("_", " ")}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Categories</h2>
          <Link to="/categories" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            All <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {cats.map((c) => {
            const inCat = items.filter((i) => i.category_id === c.id);
            const stocked = inCat.filter((i) => i.status === "stocked").length;
            const pct = inCat.length ? Math.round((stocked / inCat.length) * 100) : 0;
            return (
              <Link key={c.id} to="/category/$id" params={{ id: c.id }} className="card-glow block rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{c.icon}</span>
                  <span className="rounded-full bg-accent px-2 py-0.5 text-xs">{inCat.length}</span>
                </div>
                <p className="mt-2 font-semibold">{c.name}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-accent">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recently added</h2>
          <div className="space-y-2">
            {recent.length === 0 && <EmptyHint text="Nothing yet — press N to quick-add." />}
            {recent.map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                <span className="font-medium">{i.name}</span>
                <StatusPill status={i.status} />
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-lg font-semibold">Assigned to me</h2>
          <div className="space-y-2">
            {myItems.length === 0 && <EmptyHint text="You're all caught up! 🎉" />}
            {myItems.map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                <span className="font-medium">{i.name}</span>
                <StatusPill status={i.status} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
      <div className="float text-3xl">🌿</div>
      <p className="mt-2">{text}</p>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    needed: "bg-destructive/15 text-destructive",
    low_stock: "bg-warning/15 text-warning",
    stocked: "bg-primary/15 text-primary",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${map[status] ?? "bg-accent"}`}>{status.replace("_", " ")}</span>;
}