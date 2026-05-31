import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit2, Trash2, Check, Repeat } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItemFormDrawer, type ItemRow } from "@/components/ItemFormDrawer";
import { StatusPill } from "./_app.dashboard";
import { inr } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/category/$id")({ component: CategoryPage });

type Item = ItemRow & { id: string; created_at: string };
type Cat = { id: string; name: string; icon: string; color: string };

function CategoryPage() {
  const { id } = Route.useParams();
  const { family, user } = useAuth();
  const [cat, setCat] = useState<Cat | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<"all" | "needed" | "low_stock" | "stocked" | "urgent">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [members, setMembers] = useState<Record<string, string>>({});

  const load = async () => {
    if (!family) return;
    const [c, it, m] = await Promise.all([
      supabase.from("categories").select("*").eq("id", id).maybeSingle(),
      supabase.from("items").select("*").eq("family_id", family.id).eq("category_id", id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id,full_name").eq("family_id", family.id),
    ]);
    setCat((c.data as Cat) ?? null);
    setItems((it.data as Item[]) ?? []);
    const map: Record<string, string> = {};
    (m.data ?? []).forEach((p: { id: string; full_name: string | null }) => { map[p.id] = p.full_name ?? "?"; });
    setMembers(map);
  };

  useEffect(() => { load(); }, [family, id]);

  useEffect(() => {
    if (!family) return;
    const ch = supabase.channel(`cat:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `family_id=eq.${family.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [family, id]);

  const purchase = async (it: Item) => {
    if (!family || !user) return;
    await supabase.from("purchase_history").insert({
      family_id: family.id, item_name: it.name, category_id: id,
      purchased_by: user.id, quantity: it.quantity, unit: it.unit, cost: it.estimated_cost,
    });
    await supabase.from("items").update({ status: "stocked" }).eq("id", it.id);
    if (it.estimated_cost && Number(it.estimated_cost) > 0 && family.monthly_budget != null) {
      const next = Math.max(0, Number(family.monthly_budget) - Number(it.estimated_cost));
      await supabase.from("families").update({ monthly_budget: next }).eq("id", family.id);
    }
    toast.success("Marked as bought!");
  };

  const remove = async (it: Item) => {
    await supabase.from("items").delete().eq("id", it.id);
    toast.success("Deleted");
  };

  const filtered = items
    .filter((i) => filter === "all" ? true : filter === "urgent" ? i.priority === "urgent" : i.status === filter)
    .filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <BackButton label="Back" />
      {cat && (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-xl text-3xl" style={{ background: `${cat.color}22` }}>{cat.icon}</div>
            <div>
              <h1 className="text-3xl font-bold">{cat.name}</h1>
              <p className="text-sm text-muted-foreground">{items.length} items</p>
            </div>
          </div>
          <Button onClick={() => { setEditing(null); setDrawerOpen(true); }}><Plus className="mr-1 h-4 w-4" /> Add item</Button>
        </header>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "needed", "low_stock", "stocked", "urgent"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1 text-xs capitalize ${filter === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground/30"}`}>
            {f.replace("_", " ")}
          </button>
        ))}
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="ml-auto max-w-xs" />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <div className="float mx-auto text-5xl">📭</div>
          <p className="mt-3 text-muted-foreground">No items yet</p>
          <Button className="mt-4" onClick={() => { setEditing(null); setDrawerOpen(true); }}>Add first item</Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {filtered.map((it) => (
              <motion.div
                key={it.id}
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                className="card-glow rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{it.name}</p>
                    <p className="text-xs text-muted-foreground">{it.quantity} {it.unit}</p>
                  </div>
                  {it.is_recurring && <Repeat className="h-4 w-4 text-secondary" />}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <StatusPill status={it.status} />
                  <span className={`rounded-full px-2 py-0.5 ${
                    it.priority === "urgent" ? "bg-destructive/15 text-destructive" :
                    it.priority === "normal" ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary"
                  }`}>
                    {it.priority === "urgent" ? "🔴" : it.priority === "normal" ? "🟡" : "🟢"} {it.priority}
                  </span>
                  {it.assigned_to && (
                    <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-secondary">@{members[it.assigned_to]?.split(" ")[0]}</span>
                  )}
                </div>
                {it.notes && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{it.notes}</p>}
                {it.estimated_cost > 0 && <p className="mt-2 text-xs font-medium text-primary">{inr(it.estimated_cost)}</p>}
                <div className="mt-3 flex items-center gap-1">
                  {it.status !== "stocked" && (
                    <Button
                      size="sm"
                      onClick={() => purchase(it)}
                      className="flex-1 opacity-0 transition-opacity group-hover/item:opacity-100 focus-visible:opacity-100"
                      style={{ background: "#3ECF8E", color: "#0a0a0a" }}
                    >
                      <Check className="mr-1 h-3 w-3" /> Bought
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(it); setDrawerOpen(true); }}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(it)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <ItemFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} initial={editing ?? undefined} defaultCategoryId={id} />
    </div>
  );
}