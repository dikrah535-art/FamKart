import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ShoppingBasket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { BoughtDialog, type BoughtTarget } from "@/components/BoughtDialog";

export const Route = createFileRoute("/_app/shopping")({ component: ShoppingPage });

type Item = {
  id: string; name: string; quantity: number; unit: string;
  status: string; priority: string; estimated_cost: number; category_id: string | null;
};

function ShoppingPage() {
  const { family } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [target, setTarget] = useState<BoughtTarget | null>(null);

  const load = async () => {
    if (!family) return;
    const { data, error } = await supabase
      .from("items")
      .select("id,name,quantity,unit,status,priority,estimated_cost,category_id,created_at")
      .eq("family_id", family.id)
      .neq("status", "stocked")
      .order("created_at", { ascending: false });
    if (error) { toast.error(friendlyError(error)); return; }
    const list = (data as Item[]) ?? [];
    // Sort: urgent first, then low_stock, then needed
    const rank = (it: Item) => (it.priority === "urgent" ? 0 : it.status === "low_stock" ? 1 : 2);
    list.sort((a, b) => rank(a) - rank(b));
    setItems(list);
  };

  useEffect(() => { load(); }, [family]);
  useEffect(() => {
    if (!family) return;
    const ch = supabase.channel(`shop:${family.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `family_id=eq.${family.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [family]);

  const openBought = (it: Item) => {
    setTarget({
      id: it.id,
      name: it.name,
      quantity: Number(it.quantity) || 1,
      unit: it.unit,
      category_id: it.category_id,
    });
  };

  return (
    <div className="space-y-6">
      <BackButton label="Back" />
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Shopping list</h1>
        <p className="text-sm text-muted-foreground">Items to buy — fill in the price, tick when bought.</p>
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <ShoppingBasket className="mx-auto h-10 w-10 text-primary" />
          <p className="mt-3 text-lg font-medium">Nothing to buy right now 🎉</p>
          <p className="text-sm text-muted-foreground">Items marked needed, low stock, or urgent will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {items.map((it) => (
              <motion.div
                key={it.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 60 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-12 items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <div className="col-span-12 md:col-span-5">
                  <p className="font-semibold">{it.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {Number(it.quantity) || ""} {it.unit} ·{" "}
                    <span className={
                      it.priority === "urgent" ? "text-destructive font-medium" :
                      it.status === "low_stock" ? "text-warning" : "text-primary"
                    }>
                      {it.priority === "urgent" ? "urgent" : it.status.replace("_", " ")}
                    </span>
                  </p>
                </div>
                <div className="col-span-12 md:col-span-7 flex justify-end">
                  <Button onClick={() => openBought(it)} className="gap-1" style={{ background: "#3ECF8E", color: "#0a0a0a" }}>
                    <Check className="h-4 w-4" /> Bought
                  </Button>
                </div>
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