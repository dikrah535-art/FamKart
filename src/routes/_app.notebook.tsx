import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { BookOpen, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/format";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/_app/notebook")({ component: NotebookHome });

type Row = { item: string; qty: string; amount: number; category: string; notes: string };
type Entry = {
  id: string;
  entry_date: string;
  rows: Row[];
  total_amount: number;
};

function fmtDate(d: string) {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function NotebookHome() {
  const { family } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [flipIdx, setFlipIdx] = useState<number | null>(null);
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
      setEntries((data as unknown as Entry[]) ?? []);
      setLoading(false);
    })();
  }, [family]);

  const openToday = () => navigate({ to: "/notebook/entry" });

  const openFlip = (i: number) => { setFlipDir(1); setFlipIdx(i); };
  const close = () => setFlipIdx(null);
  const next = () => { if (flipIdx === null) return; if (flipIdx > 0) { setFlipDir(-1); setFlipIdx(flipIdx - 1); } };
  const prev = () => { if (flipIdx === null) return; if (flipIdx < entries.length - 1) { setFlipDir(1); setFlipIdx(flipIdx + 1); } };

  // Touch swipe for mobile
  useEffect(() => {
    if (flipIdx === null) return;
    let startX = 0;
    const ts = (e: TouchEvent) => { startX = e.touches[0].clientX; };
    const te = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 60) { if (dx < 0) next(); else prev(); }
    };
    window.addEventListener("touchstart", ts);
    window.addEventListener("touchend", te);
    return () => { window.removeEventListener("touchstart", ts); window.removeEventListener("touchend", te); };
  }, [flipIdx, entries.length]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <BackButton />
        <Button onClick={openToday} className="bg-primary text-primary-foreground hover:brightness-110">
          <Plus className="h-4 w-4" /> New Entry
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Family Notebook</h1>
        <p className="text-muted-foreground">Your shared family diary.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 rounded-xl shimmer" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/50 p-10 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-primary" />
          <p className="mt-3 text-lg font-medium">No diary pages yet</p>
          <p className="text-sm text-muted-foreground">Tap "New Entry" to start today's page.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {entries.map((e, i) => {
            const first = e.rows?.[0]?.item || "Empty page";
            return (
              <motion.button
                key={e.id}
                whileHover={reduce ? undefined : { y: -4, rotateZ: -1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                onClick={() => openFlip(i)}
                className="group relative h-44 overflow-hidden rounded-r-xl text-left card-glow"
                style={{
                  background: "linear-gradient(135deg, #FDFAF0 0%, #F5EFD8 100%)",
                  boxShadow: "0 6px 24px rgba(0,0,0,0.5), inset 6px 0 0 #8B5A2B",
                  color: "#3a2a1a",
                }}
              >
                <div className="flex h-full flex-col p-4 pl-7">
                  <p className="font-[Caveat] text-xl font-semibold leading-tight">{fmtDate(e.entry_date)}</p>
                  <p className="mt-2 line-clamp-2 text-sm opacity-80">{first}</p>
                  <div className="mt-auto">
                    <p className="text-xs uppercase tracking-wide opacity-60">Spent</p>
                    <p className="font-[Caveat] text-2xl font-bold">{inr(Number(e.total_amount) || 0)}</p>
                  </div>
                </div>
                <span className="pointer-events-none absolute right-0 bottom-0 h-10 w-10 origin-bottom-right rotate-0 transition-transform duration-300 group-hover:rotate-12"
                  style={{ background: "linear-gradient(225deg, rgba(0,0,0,0.18), transparent 60%)" }} />
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Flip viewer overlay */}
      <AnimatePresence>
        {flipIdx !== null && entries[flipIdx] && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={close}
            style={{ perspective: 1800 }}
          >
            <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
              <AnimatePresence mode="wait" custom={flipDir}>
                <motion.div
                  key={entries[flipIdx].id}
                  custom={flipDir}
                  initial={reduce ? { opacity: 0 } : { rotateY: flipDir === 1 ? -90 : 90, opacity: 0 }}
                  animate={reduce ? { opacity: 1 } : { rotateY: 0, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { rotateY: flipDir === 1 ? 90 : -90, opacity: 0 }}
                  transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                  style={{ transformStyle: "preserve-3d", transformOrigin: "center" }}
                >
                  <DiaryPage entry={entries[flipIdx]} readOnly />
                </motion.div>
              </AnimatePresence>

              <button
                onClick={prev}
                disabled={flipIdx >= entries.length - 1}
                className="absolute left-0 top-1/2 -translate-x-12 -translate-y-1/2 rounded-full bg-background/80 p-2 hover:bg-background disabled:opacity-30"
                aria-label="Previous (older)"
              ><ChevronLeft className="h-6 w-6" /></button>
              <button
                onClick={next}
                disabled={flipIdx <= 0}
                className="absolute right-0 top-1/2 translate-x-12 -translate-y-1/2 rounded-full bg-background/80 p-2 hover:bg-background disabled:opacity-30"
                aria-label="Next (newer)"
              ><ChevronRight className="h-6 w-6" /></button>

              <p className="mt-4 text-center text-sm text-muted-foreground">
                Page {entries.length - flipIdx} of {entries.length}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Read-only diary page rendering, reused from the entry page styles */
function DiaryPage({ entry }: { entry: Entry; readOnly: true }) {
  const total = Number(entry.total_amount) || 0;
  return (
    <div
      className="diary-page mx-auto max-h-[80vh] overflow-auto rounded-md p-6 md:p-10"
      style={{
        background: "#FDFAF0",
        color: "#2a2418",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4), inset 0 0 80px rgba(139,90,43,0.06)",
        backgroundImage:
          "repeating-linear-gradient(to bottom, transparent 0, transparent 31px, #E8E4D0 31px, #E8E4D0 32px)",
      }}
    >
      <div className="relative pl-12">
        <span className="pointer-events-none absolute top-0 bottom-0 left-10 w-[2px]" style={{ background: "#FF9999" }} />
        <p className="font-[Caveat] text-3xl font-semibold">{fmtDate(entry.entry_date)}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ color: "#555" }}>
                <th className="py-2">#</th>
                <th>Item</th>
                <th>Qty</th>
                <th>₹</th>
                <th>Category</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody className="font-[Caveat] text-lg">
              {(entry.rows || []).map((r, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "#E8E4D0" }}>
                  <td className="py-1 pr-2">{i + 1}</td>
                  <td className="pr-2">{r.item}</td>
                  <td className="pr-2">{r.qty}</td>
                  <td className="pr-2">₹ {r.amount || 0}</td>
                  <td className="pr-2">{r.category}</td>
                  <td>{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 font-[Caveat] text-xl">Total Spent: ₹ {total}</p>
      </div>
    </div>
  );
}