import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fmtDate, inr } from "@/lib/format";
import { toast } from "sonner";
import { BackButton } from "@/components/BackButton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/_app/history")({ component: HistoryPage });

type Row = {
  id: string; item_name: string; quantity: number | null; unit: string | null;
  cost: number | null; purchased_at: string; purchased_by: string | null;
  category_id: string | null;
};

function HistoryPage() {
  const { family, user, refresh } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [members, setMembers] = useState<Record<string, string>>({});
  const [cats, setCats] = useState<Record<string, { name: string; icon: string }>>({});
  const [search, setSearch] = useState("");
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    if (!family) return;
    const [{ data }, { data: m }, { data: c }] = await Promise.all([
      supabase.from("purchase_history").select("*").eq("family_id", family.id).order("purchased_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("id,full_name").eq("family_id", family.id),
      supabase.from("categories").select("id,name,icon").eq("family_id", family.id),
    ]);
    setRows((data as Row[]) ?? []);
    const mm: Record<string, string> = {}; (m ?? []).forEach((p: { id: string; full_name: string | null }) => mm[p.id] = p.full_name ?? "?"); setMembers(mm);
    const cc: Record<string, { name: string; icon: string }> = {}; (c ?? []).forEach((x: { id: string; name: string; icon: string }) => cc[x.id] = { name: x.name, icon: x.icon }); setCats(cc);
  };
  useEffect(() => { load(); }, [family]);

  const filtered = rows.filter((r) => r.item_name.toLowerCase().includes(search.toLowerCase()));
  const monthRows = rows.filter((r) => new Date(r.purchased_at) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const monthSpend = monthRows.reduce((s, r) => s + (Number(r.cost) || 0), 0);

  const reorder = async (r: Row) => {
    if (!family || !user) return;
    await supabase.from("items").insert({
      family_id: family.id, category_id: r.category_id, name: r.item_name,
      quantity: r.quantity ?? 1, unit: r.unit ?? "pcs", status: "needed",
      priority: "normal", estimated_cost: r.cost ?? 0, created_by: user.id,
    });
    toast.success(`${r.item_name} re-added`);
  };

  const openDelete = (r: Row) => { setToDelete(r); setConfirmText(""); };

  const confirmDelete = async () => {
    if (!toDelete || !family) return;
    setDeleting(true);
    const cost = Number(toDelete.cost) || 0;
    const { error } = await supabase.from("purchase_history").delete().eq("id", toDelete.id);
    if (error) { setDeleting(false); toast.error(friendlyError(error)); return; }
    if (cost > 0 && family.monthly_budget != null) {
      const next = Number(family.monthly_budget) + cost;
      await supabase.from("families").update({ monthly_budget: next }).eq("id", family.id);
      await refresh();
    }
    setRows((prev) => prev.filter((x) => x.id !== toDelete.id));
    toast.success(`Deleted ${toDelete.item_name} • ${inr(cost)} refunded`);
    setDeleting(false);
    setToDelete(null);
    setConfirmText("");
  };

  return (
    <div className="space-y-6">
      <BackButton label="Back" />
      <header>
        <h1 className="text-3xl font-bold">Purchase history</h1>
        <p className="text-sm text-muted-foreground">Everything your family has bought.</p>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">This month — items</p>
          <p className="mt-2 text-2xl font-bold">{monthRows.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">This month — spend</p>
          <p className="mt-2 text-2xl font-bold text-primary">{inr(monthSpend)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">All-time entries</p>
          <p className="mt-2 text-2xl font-bold">{rows.length}</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search purchases…" className="pl-9" />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
            <div className="float mx-auto text-5xl">🧾</div>
            <p className="mt-3 text-muted-foreground">No purchases yet</p>
          </div>
        )}
        {filtered.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{r.category_id ? cats[r.category_id]?.icon ?? "📦" : "📦"}</span>
              <div>
                <p className="font-medium">{r.item_name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.quantity} {r.unit} · {r.purchased_by ? members[r.purchased_by] ?? "?" : "?"} · {fmtDate(r.purchased_at)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-primary">{inr(Number(r.cost) || 0)}</span>
              <Button size="sm" variant="ghost" onClick={() => reorder(r)}><RotateCcw className="mr-1 h-3 w-3" /> Reorder</Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openDelete(r)}
                className="border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-1 h-3 w-3" /> Delete
              </Button>
            </div>
          </motion.div>
        ))}
      </div>

      <Dialog open={!!toDelete} onOpenChange={(o) => { if (!o) { setToDelete(null); setConfirmText(""); } }}>
        <DialogContent className="sm:max-w-md border-border/60 bg-card/80 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>Delete purchase?</DialogTitle>
            <DialogDescription>
              {toDelete && (
                <>Are you sure you want to delete <span className="font-semibold text-foreground">{toDelete.item_name}</span>? This will permanently remove the record and refund <span className="font-semibold text-primary">{inr(Number(toDelete.cost) || 0)}</span> to your budget.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Type the name of the item to confirm</Label>
            <Input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={toDelete?.item_name ?? ""}
              className="bg-background/40 backdrop-blur"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setToDelete(null); setConfirmText(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleting || !toDelete || confirmText !== toDelete.item_name}
              onClick={confirmDelete}
            >
              {deleting ? "Deleting…" : "Delete & Refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}