import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { BoughtDialog, type BoughtTarget } from "@/components/BoughtDialog";

type Tab = "needed" | "urgent" | "low_stock";

export const Route = createFileRoute("/_app/items")({
  component: ItemsPage,
  validateSearch: (s: Record<string, unknown>): { tab: Tab } => {
    const t = s.tab;
    return { tab: t === "urgent" || t === "low_stock" ? t : "needed" };
  },
});

type Item = {
  id: string; name: string; quantity: number; unit: string;
  status: string; priority: string; category_id: string | null;
};
type Cat = { id: string; name: string };

function ItemsPage() {
  const { family } = useAuth();
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [cats, setCats] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<BoughtTarget | null>(null);

  const load = async () => {
    if (!family) return;
    const [it, ct] = await Promise.all([
      supabase
        .from("items")
        .select("id,name,quantity,unit,status,priority,category_id")
        .eq("family_id", family.id)
        .neq("status", "stocked"),
      supabase.from("categories").select("id,name").eq("family_id", family.id),
    ]);
    setItems((it.data as Item[]) ?? []);
    const m: Record<string, string> = {};
    ((ct.data as Cat[]) ?? []).forEach((c) => { m[c.id] = c.name; });
    setCats(m);
  };

  useEffect(() => { load(); }, [family]);
  useEffect(() => {
    if (!family) return;
    const ch = supabase
      .channel(`itemspage:${family.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items", filter: `family_id=eq.${family.id}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [family]);

  const filtered = items.filter((i) =>
    tab === "urgent" ? i.priority === "urgent" : i.status === tab
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: "needed", label: "Needed" },
    { id: "urgent", label: "Urgent" },
    { id: "low_stock", label: "Low Stock" },
  ];

  return (
    <div className="space-y-6">
      <BackButton label="Dashboard" />
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Items</h1>
        <p className="text-sm text-muted-foreground">
          Tap ✓ Bought to enter the actual price.
        </p>
      </header>

      <div className="flex gap-2 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate({ to: "/items", search: { tab: t.id } })}
            className={`relative px-4 py-2 text-sm font-medium transition ${
              tab === t.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {tab === t.id && (
              <motion.span layoutId="items-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
          Nothing here 🎉
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <AnimatePresence initial={false}>
            {filtered.map((i) => (
              <motion.div
                key={i.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 60 }}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
              >
                <div>
                  <p className="font-semibold">{i.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {cats[i.category_id ?? ""] ?? "Uncategorized"} ·{" "}
                    {Number(i.quantity) || ""} {i.unit}
                  </p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      i.priority === "urgent"
                        ? "bg-destructive/15 text-destructive"
                        : i.status === "low_stock"
                        ? "bg-warning/15 text-warning"
                        : "bg-primary/15 text-primary"
                    }`}
                  >
                    {i.priority === "urgent" ? "urgent" : i.status.replace("_", " ")}
                  </span>
                </div>
                <Button
                  onClick={() =>
                    setTarget({
                      id: i.id,
                      name: i.name,
                      quantity: Number(i.quantity) || 1,
                      unit: i.unit,
                      category_id: i.category_id,
                    })
                  }
                  className="gap-1"
                  style={{ background: "#3ECF8E", color: "#0a0a0a" }}
                >
                  <Check className="h-4 w-4" /> Bought
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <BoughtDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        target={target}
      />
    </div>
  );
}
