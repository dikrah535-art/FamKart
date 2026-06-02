import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { BookOpen, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { inr } from "@/lib/format";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/_app/notebook")({ component: NotebookHome });

type DiaryRow = {
  item?: string; qty?: string; unit?: string; status?: string; bought?: boolean;
  price?: string | number; amount?: number;
};
type Entry = {
  id: string;
  entry_date: string;
  rows: DiaryRow[];
  total_amount: number;
};

function parseDate(s: string) { return new Date(s + "T00:00:00"); }
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDateLong(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function NotebookHome() {
  const { family } = useAuth();
  const reduce = useReducedMotion();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [flipDir, setFlipDir] = useState<1 | -1>(1);

  useEffect(() => {
    if (!family) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("notebook_entries")
        .select("id,entry_date,rows,total_amount")
        .eq("family_id", family.id)
        .order("entry_date", { ascending: false });
      if (error) toast.error(friendlyError(error));
      const list = (data as unknown as Entry[]) ?? [];
      setEntries(list);
      if (list.length) setSelected(list[0].entry_date);
      setLoading(false);
    })();
  }, [family]);

  const entryByDate = useMemo(() => {
    const m: Record<string, Entry> = {};
    for (const e of entries) m[e.entry_date] = e;
    return m;
  }, [entries]);

  const entryDates = useMemo(() => entries.map((e) => parseDate(e.entry_date)), [entries]);
  const currentIdx = selected ? entries.findIndex((e) => e.entry_date === selected) : -1;
  const current = currentIdx >= 0 ? entries[currentIdx] : null;

  const older = () => {
    if (currentIdx >= 0 && currentIdx < entries.length - 1) {
      setFlipDir(1);
      setSelected(entries[currentIdx + 1].entry_date);
    }
  };
  const newer = () => {
    if (currentIdx > 0) {
      setFlipDir(-1);
      setSelected(entries[currentIdx - 1].entry_date);
    }
  };

  useEffect(() => {
    if (!current) return;
    let sx = 0;
    const ts = (e: TouchEvent) => { sx = e.touches[0].clientX; };
    const te = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 60) { if (dx < 0) newer(); else older(); }
    };
    window.addEventListener("touchstart", ts);
    window.addEventListener("touchend", te);
    return () => {
      window.removeEventListener("touchstart", ts);
      window.removeEventListener("touchend", te);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, currentIdx, entries.length]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <BackButton />
        <Link to="/dashboard">
          <Button className="bg-primary text-primary-foreground hover:brightness-110">
            <Plus className="h-4 w-4" /> Today's Page
          </Button>
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Family Notebook</h1>
        <p className="text-muted-foreground">Pick a date or flip through the pages.</p>
      </div>

      {loading ? (
        <div className="h-72 rounded-xl shimmer" />
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/50 p-10 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-primary" />
          <p className="mt-3 text-lg font-medium">No diary pages yet</p>
          <p className="text-sm text-muted-foreground">Open the dashboard to start writing today's page.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <aside className="self-start rounded-xl border border-border bg-card p-3">
            <Calendar
              mode="single"
              selected={selected ? parseDate(selected) : undefined}
              onSelect={(d) => {
                if (!d) return;
                const ds = toDateStr(d);
                if (entryByDate[ds]) {
                  const idxNew = entries.findIndex((e) => e.entry_date === ds);
                  setFlipDir(idxNew > currentIdx ? 1 : -1);
                  setSelected(ds);
                } else {
                  toast("No entry on this day");
                }
              }}
              modifiers={{ hasEntry: entryDates }}
              modifiersClassNames={{ hasEntry: "bg-primary/15 text-primary font-semibold rounded-md" }}
              className="pointer-events-auto p-0"
            />
            <p className="mt-3 text-xs text-muted-foreground">Highlighted days have a diary page.</p>
          </aside>

          <div className="relative" style={{ perspective: 1800 }}>
            <AnimatePresence mode="wait" custom={flipDir}>
              {current && (
                <motion.div
                  key={current.id}
                  custom={flipDir}
                  initial={reduce ? { opacity: 0 } : { rotateY: flipDir === 1 ? -80 : 80, opacity: 0 }}
                  animate={reduce ? { opacity: 1 } : { rotateY: 0, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { rotateY: flipDir === 1 ? 80 : -80, opacity: 0 }}
                  transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                  style={{ transformStyle: "preserve-3d", transformOrigin: "center" }}
                >
                  <DiaryPage entry={current} />
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={older}
              disabled={currentIdx >= entries.length - 1}
              className="absolute left-0 top-1/2 -translate-x-3 -translate-y-1/2 rounded-full border border-border bg-background/80 p-2 shadow-md backdrop-blur hover:bg-background disabled:opacity-30"
              aria-label="Older page"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={newer}
              disabled={currentIdx <= 0}
              className="absolute right-0 top-1/2 translate-x-3 -translate-y-1/2 rounded-full border border-border bg-background/80 p-2 shadow-md backdrop-blur hover:bg-background disabled:opacity-30"
              aria-label="Newer page"
            >
              <ChevronRight className="h-6 w-6" />
            </button>

            {current && (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                Page {entries.length - currentIdx} of {entries.length}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DiaryPage({ entry }: { entry: Entry }) {
  const date = parseDate(entry.entry_date);
  const PAPER = "#1C1814";
  const TEXT = "#E8D5B0";
  const RULE = "rgba(255,220,150,0.08)";
  const RULE_BORDER = "rgba(255,220,150,0.12)";
  const MARGIN = "rgba(239,68,68,0.3)";
  const HEADER_BG = "rgba(255,220,150,0.15)";
  return (
    <div
      className="rounded-md border p-6 md:p-8"
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
        <p className="font-[Caveat] text-3xl font-semibold">{fmtDateLong(date)}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm" style={{ fontFamily: "Inter, system-ui, sans-serif", color: TEXT }}>
            <thead>
              <tr className="text-left" style={{ background: HEADER_BG }}>
                <th className="py-2 px-2 w-8 font-semibold">#</th>
                <th className="py-2 px-2 font-semibold">Item</th>
                <th className="py-2 px-2 w-20 font-semibold">Qty</th>
                <th className="py-2 px-2 w-20 font-semibold">Unit</th>
                <th className="py-2 px-2 w-32 font-semibold">Status</th>
                <th className="py-2 px-2 w-12 text-center font-semibold">✓</th>
                <th className="py-2 px-2 w-24 font-semibold">Price</th>
              </tr>
            </thead>
            <tbody>
              {(entry.rows || []).map((r, i) => {
                const price = r.price != null ? String(r.price) : r.amount != null ? String(r.amount) : "";
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${RULE_BORDER}` }}>
                    <td className="py-2 px-2 opacity-60">{i + 1}</td>
                    <td className="px-2">{r.item ?? ""}</td>
                    <td className="px-2">{r.qty ?? ""}</td>
                    <td className="px-2">{r.unit ?? ""}</td>
                    <td className="px-2">{(r.status ?? "").replace("_", " ")}</td>
                    <td className="text-center px-2">{r.bought ? "✓" : ""}</td>
                    <td className="px-2">{price ? `₹ ${price}` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-5 text-sm font-medium">Total Spent: {inr(Number(entry.total_amount) || 0)}</p>
      </div>
    </div>
  );
}
