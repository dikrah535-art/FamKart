import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Receipt, Plus, Trash2, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BackButton } from "@/components/BackButton";
import { inr } from "@/lib/format";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/_app/bills")({ component: BillsPage });

type Bill = {
  id: string;
  name: string;
  monthly: number;
  durationMonths: number;
  startISO: string;
  lastDeductionISO: string;
};

const STORAGE_KEY = (familyId: string) => `famkart:bills:${familyId}`;
const CYCLE = 30 * 24 * 60 * 60 * 1000;

function BillsPage() {
  const { family, user } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState("");
  const [budget, setBudget] = useState(0);
  const [spent, setSpent] = useState(0);

  const load = async () => {
    if (!family) return;
    setBudget(Number(family.monthly_budget) || 0);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { data } = await supabase
      .from("purchase_history")
      .select("cost")
      .eq("family_id", family.id)
      .gte("purchased_at", monthStart);
    setSpent((data ?? []).reduce((s, r: { cost: number | null }) => s + (Number(r.cost) || 0), 0));
    try {
      const raw = localStorage.getItem(STORAGE_KEY(family.id));
      setBills(raw ? (JSON.parse(raw) as Bill[]) : []);
    } catch { setBills([]); }
  };
  useEffect(() => { load(); }, [family]);

  const persist = (next: Bill[]) => {
    if (!family) return;
    setBills(next);
    localStorage.setItem(STORAGE_KEY(family.id), JSON.stringify(next));
  };

  const addBill = async () => {
    if (!family || !user) return;
    const amt = parseFloat(amount);
    const dur = parseInt(duration, 10);
    if (!name.trim()) return toast.error("Name required");
    if (!amt || amt <= 0) return toast.error("Monthly amount required");
    if (!dur || dur <= 0) return toast.error("Duration required");

    const nowISO = new Date().toISOString();
    const bill: Bill = {
      id: crypto.randomUUID(),
      name: name.trim(),
      monthly: amt,
      durationMonths: dur,
      startISO: nowISO,
      lastDeductionISO: nowISO,
    };

    const { error } = await supabase.from("purchase_history").insert({
      family_id: family.id,
      item_name: `Bill: ${bill.name}`,
      cost: amt,
      purchased_by: user.id,
    });
    if (error) return toast.error(friendlyError(error));

    persist([bill, ...bills]);
    setName(""); setAmount(""); setDuration("");
    toast.success(`${bill.name} added — ${inr(amt)} deducted`);
    load();
  };

  const remove = (id: string) => persist(bills.filter((b) => b.id !== id));

  const remaining = Math.max(0, budget - spent);

  return (
    <div className="space-y-6">
      <BackButton />
      <header>
        <h1 className="text-3xl font-bold">EMI & Bills</h1>
        <p className="text-sm text-muted-foreground">Recurring deductions on a 30-day cycle, synced with your monthly budget.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Monthly budget" value={inr(budget)} />
        <Stat label="Spent this month" value={inr(spent)} />
        <Stat label="Remaining" value={inr(remaining)} good />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2"><Receipt className="h-5 w-5 text-primary" /><h3 className="font-semibold">Add bill / EMI</h3></div>
        <div className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
          <div>
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input placeholder="e.g. Home loan" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Duration (months)</Label>
            <Input type="number" inputMode="numeric" placeholder="12" value={duration}
              onFocus={(e) => e.target.select()} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Monthly amount (₹)</Label>
            <Input type="number" inputMode="decimal" placeholder="0" value={amount}
              onFocus={(e) => e.target.select()} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="self-end">
            <Button onClick={addBill} className="w-full md:w-auto"><Plus className="mr-1 h-4 w-4" /> Add</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {bills.length === 0 ? (
          <div className="md:col-span-2 rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No bills yet. Add your first EMI above.
          </div>
        ) : (
          bills.map((b) => <BillCard key={b.id} bill={b} onRemove={() => remove(b.id)} />)
        )}
      </div>
    </div>
  );
}

function BillCard({ bill, onRemove }: { bill: Bill; onRemove: () => void }) {
  const last = new Date(bill.lastDeductionISO).getTime();
  const next = last + CYCLE;
  const daysLeft = Math.max(0, Math.ceil((next - Date.now()) / (24 * 60 * 60 * 1000)));
  const monthsElapsed = Math.floor((Date.now() - new Date(bill.startISO).getTime()) / CYCLE) + 1;
  const remaining = Math.max(0, bill.durationMonths - monthsElapsed);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="relative rounded-xl border border-border bg-card p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{bill.durationMonths} mo plan</p>
          <p className="mt-1 text-lg font-semibold">{bill.name}</p>
          <p className="mt-1 text-2xl font-bold text-primary">{inr(bill.monthly)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
        </div>
        <Button size="icon" variant="ghost" onClick={onRemove} aria-label="Remove">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-background/40 p-3">
        <CalendarClock className="h-4 w-4 text-primary" />
        <p className="text-sm">
          Next deduction/reminder in <span className="font-semibold text-primary">{daysLeft} day{daysLeft === 1 ? "" : "s"}</span>
        </p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {remaining} of {bill.durationMonths} months remaining
      </p>
    </motion.div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${good ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}