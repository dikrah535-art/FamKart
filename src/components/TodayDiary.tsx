import { useEffect, useRef, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

export type DiaryRow = {
  item: string;
  qty: string;
  unit: string;
  status: "needed" | "low_stock" | "urgent";
  bought: boolean;
  price: string;
  deducted?: boolean;
};

const MIN = 6;
const empty = (): DiaryRow => ({
  item: "", qty: "", unit: "", status: "needed",
  bought: false, price: "", deducted: false,
});

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function greet(name?: string | null) {
  const h = new Date().getHours();
  const p = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${p}, ${name ?? "friend"} 👋`;
}

export function TodayDiary() {
  const { family, user, profile, refresh } = useAuth();
  const date = todayStr();
  const [entryId, setEntryId] = useState<string | null>(null);
  const [rows, setRows] = useState<DiaryRow[]>(() => Array.from({ length: MIN }, empty));
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const name = (profile?.full_name || "friend").split(" ")[0];

  useEffect(() => {
    if (!family) return;
    (async () => {
      const { data } = await supabase
        .from("notebook_entries")
        .select("id,rows")
        .eq("family_id", family.id)
        .eq("entry_date", date)
        .maybeSingle();
      if (data) {
        setEntryId(data.id);
        const raw = (data.rows as unknown as Array<Record<string, unknown>>) || [];
        const normalized: DiaryRow[] = raw.map((r) => ({
          item: String(r.item ?? ""),
          qty: String(r.qty ?? ""),
          unit: String(r.unit ?? ""),
          status: (["needed", "low_stock", "urgent"].includes(String(r.status))
            ? String(r.status)
            : "needed") as DiaryRow["status"],
          bought: !!r.bought,
          price: r.price != null ? String(r.price) : r.amount != null ? String(r.amount) : "",
          deducted: !!r.deducted,
        }));
        setRows(
          normalized.length >= MIN
            ? normalized
            : [...normalized, ...Array.from({ length: MIN - normalized.length }, empty)]
        );
      }
    })();
  }, [family, date]);

  const total = rows.reduce((s, r) => s + (r.bought ? Number(r.price) || 0 : 0), 0);

  const update = (i: number, patch: Partial<DiaryRow>) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const toggleBought = async (i: number) => {
    const row = rowsRef.current[i];
    const becomingBought = !row.bought;
    update(i, { bought: becomingBought });

    // Deduct from monthly_budget when newly bought + price > 0 + not already deducted
    if (becomingBought && !row.deducted && family && family.monthly_budget != null) {
      const cost = Number(row.price) || 0;
      if (cost > 0) {
        const next = Math.max(0, Number(family.monthly_budget) - cost);
        const { error } = await supabase
          .from("families")
          .update({ monthly_budget: next })
          .eq("id", family.id);
        if (!error) {
          setRows((rs) =>
            rs.map((r, idx) => (idx === i ? { ...r, deducted: true } : r))
          );
          await refresh();
          toast.success(`₹${cost} deducted from budget`);
        }
      }
    }
  };

  const addRow = () => { setRows((rs) => [...rs, empty()]); setDirty(true); };
  const delRow = (i: number) => {
    setRows((rs) => {
      const next = rs.filter((_, idx) => idx !== i);
      return next.length >= MIN
        ? next
        : [...next, ...Array.from({ length: MIN - next.length }, empty)];
    });
    setDirty(true);
  };

  const save = async (silent = false) => {
    if (!family || !user) return;
    setSaving(true);
    const clean = rowsRef.current.filter((r) => r.item.trim() || r.price || r.qty.trim());
    const totalAmt = clean.reduce((s, r) => s + (r.bought ? Number(r.price) || 0 : 0), 0);
    const payload = {
      family_id: family.id,
      user_id: user.id,
      entry_date: date,
      rows: clean as unknown as never,
      total_amount: totalAmt,
    };
    const res = entryId
      ? await supabase.from("notebook_entries").update(payload).eq("id", entryId).select("id").maybeSingle()
      : await supabase.from("notebook_entries").upsert(payload, { onConflict: "family_id,entry_date" }).select("id").maybeSingle();
    setSaving(false);
    if (res.error) { if (!silent) toast.error(friendlyError(res.error)); return; }
    if (res.data?.id) setEntryId(res.data.id);
    setSavedAt(new Date());
    setDirty(false);
    if (!silent) toast.success("Saved ✓");
  };

  // Debounced autosave
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => save(true), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dirty]);

  const PAPER = "#1C1814";
  const TEXT = "#E8D5B0";
  const RULE = "rgba(255,220,150,0.08)";
  const RULE_BORDER = "rgba(255,220,150,0.12)";
  const MARGIN = "rgba(239,68,68,0.3)";
  const HEADER_BG = "rgba(255,220,150,0.15)";

  return (
    <div
      className="rounded-md border p-5 md:p-8"
      style={{
        background: PAPER,
        color: TEXT,
        borderColor: "rgba(255,220,150,0.1)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 31px, ${RULE} 31px, ${RULE} 32px)`,
      }}
    >
      <div className="relative pl-10 md:pl-14">
        <span
          className="pointer-events-none absolute top-0 bottom-0 left-8 md:left-12 w-[2px]"
          style={{ background: MARGIN }}
        />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-[Caveat] text-3xl md:text-4xl font-semibold">{greet(name)}</p>
            <p className="font-[Caveat] text-xl md:text-2xl mt-1 opacity-80">
              {new Date().toLocaleDateString("en-GB", {
                weekday: "long", day: "2-digit", month: "long", year: "numeric",
              })}
            </p>
          </div>
          <Button
            onClick={() => save(false)}
            disabled={saving}
            style={{ background: "#3ECF8E", color: "#0a0a0a" }}
          >
            {saving ? "Saving..." : "Save Entry"}
          </Button>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm" style={{ fontFamily: "Inter, system-ui, sans-serif", color: TEXT }}>
            <thead>
              <tr className="text-left" style={{ background: HEADER_BG }}>
                <th className="w-8 py-2 px-2 font-semibold">#</th>
                <th className="py-2 px-2 font-semibold">Item</th>
                <th className="py-2 px-2 w-20 font-semibold">Qty</th>
                <th className="py-2 px-2 w-20 font-semibold">Unit</th>
                <th className="py-2 px-2 w-32 font-semibold">Status</th>
                <th className="py-2 px-2 w-12 text-center font-semibold">✓</th>
                <th className="py-2 px-2 w-24 font-semibold">Price (₹)</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${RULE_BORDER}` }}>
                  <td className="py-2 px-2 opacity-60">{i + 1}</td>
                  <td className="px-2">
                    <input
                      value={r.item}
                      onChange={(e) => update(i, { item: e.target.value })}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-transparent outline-none focus:bg-white/5 rounded px-1"
                      style={{ color: TEXT }}
                    />
                  </td>
                  <td className="px-2">
                    <input
                      value={r.qty}
                      onChange={(e) => update(i, { qty: e.target.value })}
                      onFocus={(e) => e.target.select()}
                      placeholder="0"
                      className="w-full bg-transparent outline-none focus:bg-white/5 rounded px-1 placeholder:text-[#7a6a52]"
                      style={{ color: TEXT }}
                    />
                  </td>
                  <td className="px-2">
                    <input
                      value={r.unit}
                      onChange={(e) => update(i, { unit: e.target.value })}
                      onFocus={(e) => e.target.select()}
                      placeholder="kg"
                      className="w-full bg-transparent outline-none focus:bg-white/5 rounded px-1 placeholder:text-[#7a6a52]"
                      style={{ color: TEXT }}
                    />
                  </td>
                  <td className="px-2">
                    <select
                      value={r.status}
                      onChange={(e) => update(i, { status: e.target.value as DiaryRow["status"] })}
                      className="w-full bg-transparent outline-none rounded px-1"
                      style={{ color: TEXT, colorScheme: "dark" }}
                    >
                      <option value="needed">needed</option>
                      <option value="low_stock">low stock</option>
                      <option value="urgent">urgent</option>
                    </select>
                  </td>
                  <td className="text-center px-2">
                    <button
                      onClick={() => toggleBought(i)}
                      aria-label="Bought"
                      className={`inline-flex h-6 w-6 items-center justify-center rounded border transition ${
                        r.bought
                          ? "border-[#3ECF8E] bg-[#3ECF8E] text-[#0a0a0a]"
                          : "border-[#7a6a52] text-transparent hover:border-[#3ECF8E]"
                      }`}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="px-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={r.price}
                      onChange={(e) => update(i, { price: e.target.value })}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-transparent outline-none focus:bg-white/5 rounded px-1 placeholder:text-[#7a6a52] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      style={{ color: TEXT }}
                    />
                  </td>
                  <td>
                    <button
                      onClick={() => delRow(i)}
                      aria-label="Delete row"
                      className="opacity-50 hover:opacity-100 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={addRow}
            className="inline-flex items-center gap-1 text-sm opacity-80 hover:opacity-100"
            style={{ color: TEXT }}
          >
            <Plus className="h-4 w-4" /> Add row
          </button>
          <p className="text-sm" style={{ color: TEXT }}>Total bought: ₹ {total}</p>
        </div>
        <p className="mt-1 text-right text-xs opacity-60">
          {saving ? "saving…" : savedAt ? `Saved ✓ ${savedAt.toLocaleTimeString()}` : ""}
        </p>
      </div>
    </div>
  );
}
