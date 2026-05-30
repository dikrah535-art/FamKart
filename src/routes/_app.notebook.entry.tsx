import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BookOpen, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/notebook/entry")({ component: NotebookEntryPage });

type Row = { item: string; qty: string; amount: number; category: string; notes: string };

const MIN_ROWS = 8;
const emptyRow = (): Row => ({ item: "", qty: "", amount: 0, category: "", notes: "" });

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateLong(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function fmtDateShort(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function greetingFor(d: Date) {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "Good Morning! ☀️";
  if (h >= 12 && h < 17) return "Good Afternoon! 🌤️";
  if (h >= 17 && h < 21) return "Good Evening! 🌅";
  return "Good Night! 🌙";
}

function NotebookEntryPage() {
  const { family, user, profile } = useAuth();
  const date = todayStr();
  const now = useMemo(() => new Date(), []);
  const greeting = greetingFor(now);

  const [entryId, setEntryId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: MIN_ROWS }, emptyRow));
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const firstName = (profile?.full_name || user?.email?.split("@")[0] || "Me").split(" ")[0];

  // Load today's entry + categories
  useEffect(() => {
    if (!family) return;
    (async () => {
      setLoading(true);
      const [{ data: e }, { data: c }] = await Promise.all([
        supabase.from("notebook_entries").select("id,rows").eq("family_id", family.id).eq("entry_date", date).maybeSingle(),
        supabase.from("categories").select("id,name").eq("family_id", family.id).order("name"),
      ]);
      setCats((c as { id: string; name: string }[]) ?? []);
      if (e) {
        setEntryId(e.id);
        const loaded = (e.rows as unknown as Row[]) || [];
        const padded = loaded.length >= MIN_ROWS ? loaded : [...loaded, ...Array.from({ length: MIN_ROWS - loaded.length }, emptyRow)];
        setRows(padded);
      }
      setLoading(false);
    })();
  }, [family, date]);

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const budget = Number(family?.monthly_budget) || 0;

  // Compute month spent for budget remaining
  const [monthSpent, setMonthSpent] = useState(0);
  useEffect(() => {
    if (!family) return;
    (async () => {
      const d = new Date();
      const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      const { data } = await supabase
        .from("notebook_entries")
        .select("entry_date,total_amount")
        .eq("family_id", family.id)
        .gte("entry_date", start);
      const sum = (data ?? []).filter((r) => r.entry_date !== date).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
      setMonthSpent(sum);
    })();
  }, [family, date, savedAt]);

  const remaining = Math.max(0, budget - monthSpent - total);

  const updateRow = (i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const addRow = () => { setRows((rs) => [...rs, emptyRow()]); setDirty(true); };
  const deleteRow = (i: number) => {
    setRows((rs) => {
      const next = rs.filter((_, idx) => idx !== i);
      return next.length >= MIN_ROWS ? next : [...next, ...Array.from({ length: MIN_ROWS - next.length }, emptyRow)];
    });
    setDirty(true);
  };

  const save = async (silent = false) => {
    if (!family || !user || saving) return;
    setSaving(true);
    const cleanRows = rowsRef.current.filter((r) => r.item.trim() || r.amount > 0 || r.qty.trim() || r.notes.trim() || r.category);
    const totalAmt = cleanRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const payload = {
      family_id: family.id,
      user_id: user.id,
      entry_date: date,
      greeting,
      rows: cleanRows,
      total_amount: totalAmt,
    };
    const res = entryId
      ? await supabase.from("notebook_entries").update(payload).eq("id", entryId).select("id").maybeSingle()
      : await supabase.from("notebook_entries").upsert(payload, { onConflict: "family_id,entry_date" }).select("id").maybeSingle();
    setSaving(false);
    if (res.error) {
      if (!silent) toast.error(res.error.message);
      return;
    }
    if (res.data?.id) setEntryId(res.data.id);
    setSavedAt(new Date());
    setDirty(false);
    if (!silent) toast.success("Saved ✓");
  };

  // Auto-save every 30s when dirty
  useEffect(() => {
    const t = setInterval(() => { if (dirty) save(true); }, 30000);
    return () => clearInterval(t);
  }, [dirty, entryId, family, user]);

  const onCellKeyDown = (e: KeyboardEvent<HTMLElement>, rowIdx: number, colIdx: number, lastRow: boolean) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (lastRow) addRow();
      // focus next row, same column
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-cell="${rowIdx + 1}-${colIdx}"]`);
        el?.focus();
      });
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <BackButton />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {dirty ? <span>Unsaved changes…</span> : savedAt ? <span>Saved ✓ {savedAt.toLocaleTimeString()}</span> : null}
          <Button onClick={() => save(false)} disabled={saving} className="bg-primary text-primary-foreground hover:brightness-110">
            <BookOpen className="h-4 w-4" /> Save Entry
          </Button>
        </div>
      </div>

      <div
        className="mx-auto max-w-4xl rounded-md p-5 md:p-10"
        style={{
          background: "#FDFAF0",
          color: "#2a2418",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4), inset 0 0 80px rgba(139,90,43,0.06)",
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0, transparent 31px, #E8E4D0 31px, #E8E4D0 32px)",
        }}
      >
        <div className="relative pl-10 md:pl-14">
          <span className="pointer-events-none absolute top-0 bottom-0 left-8 md:left-12 w-[2px]" style={{ background: "#FF9999" }} />

          <p className="font-[Caveat] text-3xl md:text-4xl font-semibold">{greeting}</p>
          <p className="font-[Caveat] text-2xl md:text-3xl mt-1" style={{ color: "#555" }}>
            {fmtDateLong(now)}
          </p>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left font-semibold" style={{ color: "#555" }}>
                  <th className="w-10 py-2">#</th>
                  <th className="py-2">Item Name</th>
                  <th className="py-2 w-20">Qty</th>
                  <th className="py-2 w-28">Amount (₹)</th>
                  <th className="py-2 w-40">Category</th>
                  <th className="py-2">Notes</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="font-[Caveat] text-xl">
                {rows.map((r, i) => {
                  const lastRow = i === rows.length - 1;
                  return (
                    <tr key={i} className="border-t" style={{ borderColor: "#E8E4D0" }}>
                      <td className="py-1 pr-2 align-middle opacity-70">{i + 1}</td>
                      <td className="pr-2">
                        <input
                          data-cell={`${i}-1`}
                          value={r.item}
                          onChange={(e) => updateRow(i, { item: e.target.value })}
                          onBlur={() => dirty && save(true)}
                          onKeyDown={(e) => onCellKeyDown(e, i, 1, lastRow)}
                          className="w-full bg-transparent outline-none focus:bg-yellow-100/40"
                        />
                      </td>
                      <td className="pr-2">
                        <input
                          data-cell={`${i}-2`}
                          value={r.qty}
                          onChange={(e) => updateRow(i, { qty: e.target.value })}
                          onBlur={() => dirty && save(true)}
                          onKeyDown={(e) => onCellKeyDown(e, i, 2, lastRow)}
                          className="w-full bg-transparent outline-none focus:bg-yellow-100/40"
                        />
                      </td>
                      <td className="pr-2">
                        <div className="flex items-center gap-1">
                          <span className="opacity-60">₹</span>
                          <input
                            data-cell={`${i}-3`}
                            type="number"
                            inputMode="decimal"
                            value={r.amount || ""}
                            onChange={(e) => updateRow(i, { amount: Number(e.target.value) || 0 })}
                            onBlur={() => dirty && save(true)}
                            onKeyDown={(e) => onCellKeyDown(e, i, 3, lastRow)}
                            className="w-full bg-transparent outline-none focus:bg-yellow-100/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                      </td>
                      <td className="pr-2">
                        <select
                          data-cell={`${i}-4`}
                          value={r.category}
                          onChange={(e) => updateRow(i, { category: e.target.value })}
                          onBlur={() => dirty && save(true)}
                          className="w-full bg-transparent outline-none font-[Caveat] text-xl focus:bg-yellow-100/40"
                          style={{ color: "#2a2418" }}
                        >
                          <option value="">—</option>
                          {cats.map((c) => (
                            <option key={c.id} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="pr-2">
                        <input
                          data-cell={`${i}-5`}
                          value={r.notes}
                          onChange={(e) => updateRow(i, { notes: e.target.value })}
                          onBlur={() => dirty && save(true)}
                          onKeyDown={(e) => onCellKeyDown(e, i, 5, lastRow)}
                          className="w-full bg-transparent outline-none focus:bg-yellow-100/40"
                        />
                      </td>
                      <td>
                        <button
                          onClick={() => deleteRow(i)}
                          aria-label="Delete row"
                          className="opacity-50 transition hover:opacity-100 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-col items-end gap-1 font-[Caveat] text-2xl">
            <p>Total Spent: ₹ {total}</p>
            {budget > 0 && <p style={{ color: remaining > 0 ? "#2a7a45" : "#a33" }}>Budget Remaining: ₹ {remaining}</p>}
          </div>

          <p className="mt-10 text-right font-[Caveat] text-2xl italic" style={{ color: "#3a2a1a" }}>
            — {firstName}, {fmtDateShort(now)}
          </p>
        </div>
      </div>

      {loading && <p className="mt-3 text-center text-xs text-muted-foreground">Loading…</p>}
    </div>
  );
}