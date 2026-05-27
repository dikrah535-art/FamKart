import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { inr } from "@/lib/format";
import { toast } from "sonner";
import { BackButton } from "@/components/BackButton";

export const Route = createFileRoute("/_app/budget")({ component: BudgetPage });

type Cat = { id: string; name: string; color: string };
type Hist = { category_id: string | null; cost: number | null; purchased_at: string };
type Item = { category_id: string | null; estimated_cost: number; status: string };

function BudgetPage() {
  const { family, refresh } = useAuth();
  const [cats, setCats] = useState<Cat[]>([]);
  const [hist, setHist] = useState<Hist[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [budget, setBudget] = useState<string>("");

  const load = async () => {
    if (!family) return;
    const [{ data: c }, { data: h }, { data: it }] = await Promise.all([
      supabase.from("categories").select("id,name,color").eq("family_id", family.id),
      supabase.from("purchase_history").select("category_id,cost,purchased_at").eq("family_id", family.id),
      supabase.from("items").select("category_id,estimated_cost,status").eq("family_id", family.id).neq("status", "stocked"),
    ]);
    setCats((c as Cat[]) ?? []);
    setHist((h as Hist[]) ?? []);
    setItems((it as Item[]) ?? []);
    setBudget(String(family.monthly_budget ?? ""));
  };
  useEffect(() => { load(); }, [family]);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthHist = hist.filter((h) => new Date(h.purchased_at) >= monthStart);
  const monthSpend = monthHist.reduce((s, h) => s + (Number(h.cost) || 0), 0);
  const budgetNum = Number(family?.monthly_budget) || 0;
  const pct = budgetNum ? Math.min(100, Math.round((monthSpend / budgetNum) * 100)) : 0;
  const pctColor = pct < 70 ? "var(--color-primary)" : pct < 90 ? "var(--color-warning)" : "var(--color-destructive)";

  const byCat = useMemo(() => cats.map((c) => {
    const spent = monthHist.filter((h) => h.category_id === c.id).reduce((s, h) => s + (Number(h.cost) || 0), 0);
    const est = items.filter((i) => i.category_id === c.id).reduce((s, i) => s + (Number(i.estimated_cost) || 0), 0);
    const count = items.filter((i) => i.category_id === c.id).length;
    return { name: c.name, color: c.color, spent, est, count };
  }), [cats, monthHist, items]);

  const trend = useMemo(() => {
    const months: { label: string; spend: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i); d.setDate(1);
      const next = new Date(d); next.setMonth(next.getMonth() + 1);
      const total = hist.filter((h) => { const x = new Date(h.purchased_at); return x >= d && x < next; }).reduce((s, h) => s + (Number(h.cost) || 0), 0);
      months.push({ label: d.toLocaleString("en-IN", { month: "short" }), spend: Math.round(total) });
    }
    return months;
  }, [hist]);

  const saveBudget = async () => {
    if (!family) return;
    const n = Number(budget) || 0;
    const { error } = await supabase.from("families").update({ monthly_budget: n }).eq("id", family.id);
    if (error) return toast.error(error.message);
    toast.success("Budget updated");
    await refresh();
  };

  return (
    <div className="space-y-6">
      <BackButton label="Back" />
      <header>
        <h1 className="text-3xl font-bold">Budget</h1>
        <p className="text-sm text-muted-foreground">Track monthly spend across categories.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <Label className="text-xs text-muted-foreground">Monthly budget</Label>
          <div className="mt-2 flex items-center gap-2">
            <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" />
            <Button onClick={saveBudget}>Save</Button>
          </div>
          <p className="mt-3 text-2xl font-bold">{inr(budgetNum)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Spent this month</p>
          <p className="mt-2 text-3xl font-bold" style={{ color: pctColor }}>{inr(monthSpend)}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-accent">
            <div className="h-full transition-all" style={{ width: `${pct}%`, background: pctColor }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{pct}% of budget</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Remaining</p>
          <p className="mt-2 text-3xl font-bold text-primary">{inr(Math.max(0, budgetNum - monthSpend))}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 font-semibold">Spend by category</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byCat}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Bar dataKey="spent" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 font-semibold">Used vs remaining</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={[
                  { name: "Spent", value: monthSpend },
                  { name: "Remaining", value: Math.max(0, budgetNum - monthSpend) || 1 },
                ]}
                dataKey="value" innerRadius={60} outerRadius={100} stroke="none"
              >
                <Cell fill="var(--color-primary)" />
                <Cell fill="var(--color-muted)" />
              </Pie>
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 font-semibold">Trend — last 6 months</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={11} />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
            <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
            <Line type="monotone" dataKey="spend" stroke="var(--color-primary)" strokeWidth={2} dot={{ fill: "var(--color-primary)" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-accent/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-3 text-left">Category</th><th className="px-4 py-3 text-right">Items</th><th className="px-4 py-3 text-right">Estimated</th><th className="px-4 py-3 text-right">Actual</th></tr>
          </thead>
          <tbody>
            {byCat.map((c) => (
              <tr key={c.name} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{c.count}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{inr(c.est)}</td>
                <td className="px-4 py-3 text-right font-semibold text-primary">{inr(c.spent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}