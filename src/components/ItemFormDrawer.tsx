import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
export type ItemRow = {
  id?: string;
  name: string;
  category_id: string | null;
  status: "needed" | "low_stock" | "stocked";
  quantity: number;
  unit: string;
  priority: "urgent" | "normal" | "low";
  assigned_to: string | null;
  notes: string;
  is_recurring: boolean;
  recur_interval: "daily" | "weekly" | "monthly" | null;
  estimated_cost?: number;
};

const empty: ItemRow = {
  name: "", category_id: null, status: "needed", quantity: 1, unit: "pcs",
  priority: "normal", assigned_to: null, notes: "", is_recurring: false,
  recur_interval: null,
};

export function ItemFormDrawer({
  open, onClose, initial, defaultCategoryId,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<ItemRow> & { id?: string };
  defaultCategoryId?: string;
}) {
  const { user, family } = useAuth();
  const [form, setForm] = useState<ItemRow>(empty);
  const [categories, setCategories] = useState<{ id: string; name: string; icon: string }[]>([]);
  const [members, setMembers] = useState<{ id: string; full_name: string | null }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ ...empty, ...(defaultCategoryId ? { category_id: defaultCategoryId } : {}), ...(initial ?? {}) } as ItemRow);
  }, [open, initial, defaultCategoryId]);

  useEffect(() => {
    if (!open || !family) return;
    supabase.from("categories").select("id,name,icon").eq("family_id", family.id).order("name").then(({ data }) => setCategories(data ?? []));
    supabase.from("profiles").select("id,full_name").eq("family_id", family.id).then(({ data }) => setMembers(data ?? []));
  }, [open, family]);

  const save = async () => {
    if (!form.name.trim() || !family || !user) return toast.error("Name required");
    setSaving(true);
    const payload = {
      ...form,
      family_id: family.id,
      created_by: user.id,
      recur_interval: form.is_recurring ? form.recur_interval ?? "weekly" : null,
      estimated_cost: 0,
    };
    const { error } = initial?.id
      ? await supabase.from("items").update(payload).eq("id", initial.id)
      : await supabase.from("items").insert(payload);
    setSaving(false);
    if (error) return toast.error(friendlyError(error));
    toast.success(initial?.id ? "Item updated" : "Item added");
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-6"
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold">{initial?.id ? "Edit item" : "Add item"}</h2>
              <Button size="icon" variant="ghost" onClick={onClose}><X className="h-5 w-5" /></Button>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Item name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Milk" />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category_id ?? ""} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number" min={0} step="0.1"
                    value={form.quantity ? String(form.quantity) : ""}
                    placeholder="0"
                    onChange={(e) => setForm({ ...form, quantity: e.target.value === "" ? 0 : Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="kg, litre, pack" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["needed", "low_stock", "stocked"] as const).map((s) => (
                    <button key={s} type="button" onClick={() => setForm({ ...form, status: s })}
                      className={`rounded-md border px-3 py-2 text-xs capitalize transition ${form.status === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground/30"}`}>
                      {s.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["urgent", "normal", "low"] as const).map((p) => (
                    <button key={p} type="button" onClick={() => setForm({ ...form, priority: p })}
                      className={`rounded-md border px-3 py-2 text-xs capitalize transition ${form.priority === p ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground/30"}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Assign to</Label>
                <Select value={form.assigned_to ?? "none"} onValueChange={(v) => setForm({ ...form, assigned_to: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Anyone</SelectItem>
                    {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? "Member"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Brand preference, store, etc." />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <Label>Recurring</Label>
                  <p className="text-xs text-muted-foreground">Auto-add on a schedule</p>
                </div>
                <Switch checked={form.is_recurring} onCheckedChange={(v) => setForm({ ...form, is_recurring: v })} />
              </div>
              {form.is_recurring && (
                <Select value={form.recur_interval ?? "weekly"} onValueChange={(v) => setForm({ ...form, recur_interval: v as ItemRow["recur_interval"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Button onClick={save} disabled={saving} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (initial?.id ? "Save changes" : "Add item")}
              </Button>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}