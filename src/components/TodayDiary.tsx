import { useEffect, useRef, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

export type DiaryRow = {
  item: string;
  qty: string;
  unit: string;
  status: "needed" | "low_stock" | "urgent";
  bought: boolean;
  price: string;
};

const MIN = 6;
const empty = (): DiaryRow => ({ item: "", qty: "", unit: "", status: "needed", bought: false, price: "" });

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
  const { family, user, profile } = useAuth();
  const date = todayStr();
  const [entryId, setEntryId] = useState<string | null>(null);
  const [rows, setRows] = useState<DiaryRow[]>(() => Array.from({ length: MIN }, empty));
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
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
          status: (["needed", "low_stock", "urgent"].includes(String(r.status)) ? String(r.status) : "needed") as DiaryRow["status"],
          bought: !!r.bought,
          price: r.price != null ? String(r.price) : r.amount != null ? String(r.amount) : "",
        }));
        setRows(normalized.length >= MIN ? normalized : [...normalized, ...Array.from({ length: MIN - normalized.length }, empty)]);
      }
    })();
  }, [family, date]);

  const total = rows.reduce((s, r) => s + (r.bought ? Number(r.price) || 0 : 0), 0);

  const update = (i: number, patch: Partial<DiaryRow>) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const addRow = () => { setRows((rs) => [...rs, empty()]); setDirty(true); };
  const delRow = (i: number) => {
    setRows((rs) => {
      const next = rs.filter((_, idx) => idx !== i);
      return next.length >= MIN ? next : [...next, ...Array.from({ length: MIN - next.length }, empty)];
    });
    setDirty(true);
  };

  const save = async (silent = false) => {
    if (!family || !user) return;
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

  return (
    <div
      className="rounded-md p-5 md:p-8"
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
        <p className="font-[Caveat] text-3xl md:text-4xl font-semibold">{greet(name)}</p>
        <p className="font-[Caveat] text-xl md:text-2xl mt-1" style={{ color: "#555" }}>
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="text-left font-semibold" style={{ color: "#555" }}>
                <th className="w-8 py-2">#</th>
                <th className="py-2">Item</th>
                <th className="py-2 w-20">Qty</th>
                <th className="py-2 w-20">Unit</th>
                <th className="py-2 w-32">Status</th>
                <th className="py-2 w-12 text-center">✓</th>
                <th className="py-2 w-24">Price (₹)</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="font-[Caveat] text-xl">
              {rows.map((r, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "#E8E4D0" }}>
                  <td className="py-1 pr-2 opacity-70">{i + 1}</td>
                  <td className="pr-2">
                    <input value={r.item} onChange={(e) => update(i, { item: e.target.value })}
                      className="w-full bg-transparent outline-none focus:bg-yellow-100/40" />
                  </td>
                  <td className="pr-2">
                    <input value={r.qty} onChange={(e) => update(i, { qty: e.target.value })}
                      placeholder="0" className="w-full bg-transparent outline-none focus:bg-yellow-100/40 placeholder:text-[#b6ad95]" />
                  </td>
                  <td className="pr-2">
                    <input value={r.unit} onChange={(e) => update(i, { unit: e.target.value })}
                      placeholder="kg" className="w-full bg-transparent outline-none focus:bg-yellow-100/40 placeholder:text-[#b6ad95]" />
                  </td>
                  <td className="pr-2">
                    <select value={r.status}
                      onChange={(e) => update(i, { status: e.target.value as DiaryRow["status"] })}
                      className="w-full bg-transparent outline-none font-[Caveat] text-xl focus:bg-yellow-100/40"
                      style={{ color: "#2a2418" }}>
                      <option value="needed">needed</option>
                      <option value="low_stock">low stock</option>
                      <option value="urgent">urgent</option>
                    </select>
                  </td>
                  <td className="text-center">
                    <button onClick={() => update(i, { bought: !r.bought })} aria-label="Bought"
                      className={`inline-flex h-6 w-6 items-center justify-center rounded border transition ${r.bought ? "border-green-700 bg-green-600 text-white" : "border-[#b6ad95] text-transparent hover:border-green-600"}`}>
                      <Check className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="pr-2">
                    <input type="number" inputMode="decimal" placeholder="0"
                      value={r.price}
                      onChange={(e) => update(i, { price: e.target.value })}
                      className="w-full bg-transparent outline-none focus:bg-yellow-100/40 placeholder:text-[#b6ad95] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                  </td>
                  <td>
                    <button onClick={() => delRow(i)} aria-label="Delete row" className="opacity-50 hover:opacity-100 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between font-[Caveat] text-xl">
          <button onClick={addRow} className="inline-flex items-center gap-1 text-[#3a2a1a] hover:underline">
            <Plus className="h-4 w-4" /> Add row
          </button>
          <p>Total bought: ₹ {total}</p>
        </div>
        <p className="mt-1 text-right text-xs" style={{ color: "#888" }}>
          {dirty ? "saving…" : savedAt ? `saved ${savedAt.toLocaleTimeString()}` : ""}
        </p>
      </div>
    </div>
  );
}