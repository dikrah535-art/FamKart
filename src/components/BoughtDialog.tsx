import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

export type BoughtTarget = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category_id: string | null;
};

export function BoughtDialog({
  open,
  onOpenChange,
  target,
  onDone,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  target: BoughtTarget | null;
  onDone?: () => void;
}) {
  const { user, family, refresh } = useAuth();
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setPrice(""); }, [open]);

  const confirm = async () => {
    if (!target || !family || !user) return;
    setSaving(true);
    const cost = Number(price) || 0;
    const { error: hErr } = await supabase.from("purchase_history").insert({
      family_id: family.id,
      item_name: target.name,
      category_id: target.category_id,
      purchased_by: user.id,
      quantity: target.quantity,
      unit: target.unit,
      cost,
    });
    if (hErr) { setSaving(false); toast.error(friendlyError(hErr)); return; }
    await supabase.from("items").update({ status: "stocked" }).eq("id", target.id);
    if (cost > 0 && family.monthly_budget != null) {
      const next = Math.max(0, Number(family.monthly_budget) - cost);
      await supabase.from("families").update({ monthly_budget: next }).eq("id", family.id);
      await refresh();
    }
    setSaving(false);
    toast.success(`Marked as bought! \u20B9${cost} deducted from budget`);
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark as Bought</DialogTitle>
        </DialogHeader>
        {target && <p className="text-sm text-muted-foreground">{target.name}</p>}
        <div className="space-y-2">
          <Label>Actual price paid (\u20B9)</Label>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onFocus={(e) => e.target.select()}
            autoFocus
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={saving}
            onClick={confirm}
            style={{ background: "#3ECF8E", color: "#0a0a0a" }}
          >
            {saving ? "Saving..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
