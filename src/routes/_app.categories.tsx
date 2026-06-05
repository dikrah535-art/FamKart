import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { CategoryIcon } from "@/components/CategoryIcon";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

type CategoryFilter = "all" | "needed" | "urgent" | "low_stock";

export const Route = createFileRoute("/_app/categories")({
  component: CategoriesPage,
  validateSearch: (search: Record<string, unknown>): { filter: CategoryFilter } => {
    const f = search.filter;
    return {
      filter: f === "needed" || f === "urgent" || f === "low_stock" ? f : "all",
    };
  },
});

type Cat = { id: string; name: string; icon: string; color: string };

function CategoriesPage() {
  const { family } = useAuth();
  const reduce = useReducedMotion();
  const { filter } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [cats, setCats] = useState<Cat[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [activeCounts, setActiveCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📦");
  const [color, setColor] = useState("#3ECF8E");

  const load = async () => {
    if (!family) return;
    const { data } = await supabase.from("categories").select("*").eq("family_id", family.id).order("name");
    setCats((data as Cat[]) ?? []);
    let q = supabase.from("items").select("category_id,status,priority").eq("family_id", family.id);
    if (filter === "needed" || filter === "low_stock") q = q.eq("status", filter);
    else if (filter === "urgent") q = q.eq("priority", "urgent").neq("status", "stocked");
    const { data: items } = await q;
    const map: Record<string, number> = {};
    (items ?? []).forEach((i: { category_id: string | null }) => { if (i.category_id) map[i.category_id] = (map[i.category_id] || 0) + 1; });
    setCounts(map);

    // Active = not stocked AND (needed | low_stock | urgent priority) — for green border indicator
    const { data: allItems } = await supabase
      .from("items")
      .select("category_id,status,priority")
      .eq("family_id", family.id);
    const aMap: Record<string, number> = {};
    (allItems ?? []).forEach((i: { category_id: string | null; status: string; priority: string }) => {
      if (!i.category_id) return;
      if (i.status !== "stocked" && (i.status === "needed" || i.status === "low_stock" || i.priority === "urgent")) {
        aMap[i.category_id] = (aMap[i.category_id] || 0) + 1;
      }
    });
    setActiveCounts(aMap);
  };

  useEffect(() => { load(); }, [family, filter]);

  useEffect(() => {
    if (!family) return;
    const ch = supabase
      .channel(`cats:${family.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items", filter: `family_id=eq.${family.id}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [family, filter]);

  const create = async () => {
    if (!family || !name.trim()) return;
    const { error } = await supabase.from("categories").insert({ family_id: family.id, name: name.trim(), icon, color });
    if (error) return toast.error(friendlyError(error));
    toast.success("Category added");
    setName(""); setIcon("📦"); setColor("#3ECF8E"); setOpen(false);
    load();
  };

  return (
    <div className="space-y-6">
      <BackButton label="Back" />
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Categories</h1>
          <p className="text-sm text-muted-foreground">Organize what you track.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" /> New category</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New category</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Toys" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Emoji</Label><Input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} /></div>
                <div className="space-y-2"><Label>Color</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></div>
              </div>
              <Button onClick={create} className="w-full">Add</Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "needed", "urgent", "low_stock"] as const).map((f) => (
          <button
            key={f}
            onClick={() => navigate({ search: { filter: f } })}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition ${
              filter === f
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-foreground/30"
            }`}
          >
            {f.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {cats
          .filter((c) => (filter === "all" ? true : (counts[c.id] ?? 0) > 0))
          .map((c, i) => (
          <motion.div
            key={c.id}
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.3 }}
            whileHover={reduce ? undefined : "hover"}
            layout
          >
            <Link
              to="/category/$id"
              params={{ id: c.id }}
              className="card-glow group block rounded-xl border bg-card p-5 transition-colors duration-500"
              style={{
                borderColor: (activeCounts[c.id] ?? 0) > 0 ? "#3ECF8E" : "var(--color-border)",
                boxShadow: (activeCounts[c.id] ?? 0) > 0
                  ? "0 0 0 1px rgba(62,207,142,0.25), 0 0 14px rgba(62,207,142,0.18)"
                  : undefined,
              }}
            >
              <div className="flex items-center justify-between">
                <CategoryIcon name={c.name} color={c.color} size={32} />
                <motion.span
                  variants={{ hover: { y: -3 } }}
                  className="rounded-full px-2 py-0.5 text-xs transition-colors duration-500"
                  style={{
                    background: (activeCounts[c.id] ?? 0) > 0
                      ? "rgba(62,207,142,0.15)"
                      : "var(--color-accent)",
                    color: (activeCounts[c.id] ?? 0) > 0 ? "#3ECF8E" : undefined,
                  }}
                >{counts[c.id] ?? 0} items</motion.span>
              </div>
              <p className="mt-3 font-semibold">{c.name}</p>
              <div
                className="mt-3 h-1 overflow-hidden rounded-full transition-colors duration-500"
                style={{ background: (activeCounts[c.id] ?? 0) > 0 ? "var(--color-accent)" : "#000" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: (activeCounts[c.id] ?? 0) > 0 ? "100%" : "0%",
                    background: "#3ECF8E",
                  }}
                />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}