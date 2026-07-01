import { Link } from "@tanstack/react-router";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BookOpen, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { useAuth } from "@/lib/auth-context";
import { inr } from "@/lib/format";

type SyncStatus = "synced" | "draft" | "saving" | "error";

type DiaryRow = {
  item?: string;
  qty?: string;
  unit?: string;
  status?: string;
  bought?: boolean;
  price?: string | number;
  amount?: number;
};

type Entry = {
  id: string;
  entry_date: string;
  content: string;
  rows: DiaryRow[];
  total_amount: number;
  user_id: string;
  updated_by: string | null;
  isDraft?: boolean;
};

type FamilyNotebookProps = {
  showHeader?: boolean;
  showBackButton?: boolean;
  dashboardLink?: boolean;
  showCalendar?: boolean;
};

const PAPER = "#1C1814";
const TEXT = "#E8D5B0";
const RULE = "rgba(255,220,150,0.08)";
const RULE_BORDER = "rgba(255,220,150,0.12)";
const MARGIN = "rgba(239,68,68,0.3)";
const HEADER_BG = "rgba(255,220,150,0.15)";

function parseDate(s: string) {
  return new Date(s + "T00:00:00");
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateLong(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function todayDateStr() {
  return toDateStr(new Date());
}

function draftKey(familyId: string, date: string) {
  return `famkart:notebook:${familyId}:${date}`;
}

function blankEntry(date: string): Entry {
  return {
    id: `draft-${date}`,
    entry_date: date,
    content: "",
    rows: [],
    total_amount: 0,
    user_id: "",
    updated_by: null,
    isDraft: true,
  };
}

function sortEntries(entries: Entry[]) {
  return [...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
}

function upsertEntry(entries: Entry[], next: Entry) {
  const idx = entries.findIndex((entry) => entry.entry_date === next.entry_date);
  if (idx === -1) return sortEntries([...entries, next]);
  const copy = [...entries];
  copy[idx] = { ...copy[idx], ...next, isDraft: false };
  return sortEntries(copy);
}

function contentFromLegacyRows(entry: Entry) {
  if (entry.content) return entry.content;
  if (!entry.rows?.length) return "";

  const lines = entry.rows.map((row, index) => {
    const parts = [
      `${index + 1}.`,
      row.item,
      row.qty ? `- ${row.qty}` : "",
      row.unit,
      row.status ? `(${row.status.replace("_", " ")})` : "",
      row.bought ? "[bought]" : "",
      row.price != null ? `Rs ${row.price}` : row.amount != null ? `Rs ${row.amount}` : "",
    ].filter(Boolean);
    return parts.join(" ");
  });

  if (entry.total_amount) lines.push(`Total Spent: ${inr(Number(entry.total_amount) || 0)}`);
  return lines.join("\n");
}

export function FamilyNotebook({
  showHeader = true,
  showBackButton = true,
  dashboardLink = true,
  showCalendar = true,
}: FamilyNotebookProps) {
  const { family, user } = useAuth();
  const reduce = useReducedMotion();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(todayDateStr());
  const [content, setContent] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [flipDir, setFlipDir] = useState<1 | -1>(1);

  const serverContentRef = useRef("");
  const isSavingRef = useRef(false);
  const pendingContentRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const selectedRef = useRef(selected);
  const contentRef = useRef(content);
  const syncStatusRef = useRef(syncStatus);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    syncStatusRef.current = syncStatus;
  }, [syncStatus]);

  const entryByDate = useMemo(() => {
    const map: Record<string, Entry> = {};
    for (const entry of entries) map[entry.entry_date] = entry;
    return map;
  }, [entries]);

  const current = entryByDate[selected] ?? blankEntry(selected);
  const currentIdx = entries.findIndex((entry) => entry.entry_date === selected);
  const entryDates = useMemo(() => entries.map((entry) => parseDate(entry.entry_date)), [entries]);

  const applyEntryToEditor = (entry: Entry, familyId: string) => {
    const serverText = contentFromLegacyRows(entry);
    const cachedDraft = localStorage.getItem(draftKey(familyId, entry.entry_date));

    serverContentRef.current = serverText;
    if (cachedDraft !== null && cachedDraft !== serverText) {
      setContent(cachedDraft);
      setSyncStatus("draft");
    } else {
      setContent(serverText);
      setSyncStatus("synced");
    }
  };

  const loadEntries = async () => {
    if (!family?.id) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("notebook_entries")
      .select("id,entry_date,content,rows,total_amount,user_id,updated_by")
      .eq("family_id", family.id)
      .order("entry_date", { ascending: false });

    if (error) {
      toast.error(friendlyError(error));
      setSyncStatus("error");
      setLoading(false);
      return;
    }

    const today = todayDateStr();
    const list = sortEntries(((data as unknown as Entry[]) ?? []).map((entry) => ({
      ...entry,
      content: contentFromLegacyRows(entry),
    })));
    const hasSelected = list.some((entry) => entry.entry_date === selectedRef.current);
    const nextSelected = hasSelected ? selectedRef.current : today;
    const nextCurrent = list.find((entry) => entry.entry_date === nextSelected) ?? blankEntry(nextSelected);

    setEntries(list);
    setSelected(nextSelected);
    applyEntryToEditor(nextCurrent, family.id);
    setLoading(false);
  };

  useEffect(() => {
    if (!family?.id) return;
    loadEntries();

    const channel = supabase
      .channel(`notebook:${family.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notebook_entries",
          filter: `family_id=eq.${family.id}`,
        },
        (payload: RealtimePostgresChangesPayload<Entry>) => {
          if (payload.eventType === "DELETE") {
            const deletedDate = payload.old?.entry_date;
            if (!deletedDate) return;
            setEntries((prev) => prev.filter((entry) => entry.entry_date !== deletedDate));
            return;
          }

          const incoming = payload.new;
          if (!incoming) return;

          const next = {
            ...incoming,
            content: contentFromLegacyRows(incoming),
          };

          setEntries((prev) => upsertEntry(prev, next));

          if (next.entry_date === selectedRef.current && next.updated_by !== user?.id) {
            serverContentRef.current = next.content;
            const key = draftKey(family.id, next.entry_date);
            if (syncStatusRef.current === "synced" || contentRef.current === serverContentRef.current) {
              localStorage.removeItem(key);
              setContent(next.content);
              setSyncStatus("synced");
            }
          }
        },
      )
      .subscribe();

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family?.id, user?.id]);

  useEffect(() => {
    if (!family?.id) return;
    const nextCurrent = entryByDate[selected] ?? blankEntry(selected);
    applyEntryToEditor(nextCurrent, family.id);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const executeSave = async (textToSave: string, dateToSave: string) => {
    if (!family?.id || !user?.id) return;

    isSavingRef.current = true;
    setSyncStatus("saving");

    const existing = entryByDate[dateToSave];
    const payload = {
      family_id: family.id,
      user_id: existing?.user_id || user.id,
      entry_date: dateToSave,
      content: textToSave,
      rows: existing?.rows ?? [],
      total_amount: existing?.total_amount ?? 0,
      updated_by: user.id,
    };

    const { data, error } = await supabase
      .from("notebook_entries")
      .upsert(payload, { onConflict: "family_id,entry_date" })
      .select("id,entry_date,content,rows,total_amount,user_id,updated_by")
      .single();

    if (error) {
      toast.error(friendlyError(error));
      setSyncStatus("error");
    } else if (data) {
      const saved = data as unknown as Entry;
      serverContentRef.current = saved.content ?? "";
      localStorage.removeItem(draftKey(family.id, dateToSave));
      setEntries((prev) => upsertEntry(prev, { ...saved, rows: saved.rows ?? [] }));
      setSyncStatus("synced");
    }

    isSavingRef.current = false;
    if (pendingContentRef.current !== null) {
      const pending = pendingContentRef.current;
      pendingContentRef.current = null;
      executeSave(pending, dateToSave);
    }
  };

  const queueSave = (nextContent: string, dateToSave: string) => {
    if (nextContent === serverContentRef.current) {
      setSyncStatus("synced");
      if (family?.id) localStorage.removeItem(draftKey(family.id, dateToSave));
      return;
    }

    if (isSavingRef.current) {
      pendingContentRef.current = nextContent;
      return;
    }

    executeSave(nextContent, dateToSave);
  };

  const handleContentChange = (nextContent: string) => {
    if (!family?.id) return;

    setContent(nextContent);
    setSyncStatus("draft");
    localStorage.setItem(draftKey(family.id, selected), nextContent);
    setEntries((prev) => upsertEntry(prev, { ...current, content: nextContent }));

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      queueSave(nextContent, selected);
    }, 2000);
  };

  const selectDate = (date: string) => {
    const idxNew = entries.findIndex((entry) => entry.entry_date === date);
    setFlipDir(idxNew > currentIdx ? 1 : -1);
    setSelected(date);
  };

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
    let sx = 0;
    const ts = (e: TouchEvent) => {
      sx = e.touches[0].clientX;
    };
    const te = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 60) {
        if (dx < 0) newer();
        else older();
      }
    };
    window.addEventListener("touchstart", ts);
    window.addEventListener("touchend", te);
    return () => {
      window.removeEventListener("touchstart", ts);
      window.removeEventListener("touchend", te);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, entries.length]);

  return (
    <div>
      {showBackButton && (
        <div className="mb-4 flex items-center justify-between">
          <BackButton />
          {dashboardLink && (
            <Link to="/dashboard">
              <Button className="bg-primary text-primary-foreground hover:brightness-110">
                <Plus className="h-4 w-4" /> Today's Page
              </Button>
            </Link>
          )}
        </div>
      )}

      {showHeader && (
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Family Notebook</h1>
          <p className="text-muted-foreground">Pick a date or flip through the pages.</p>
        </div>
      )}

      {loading ? (
        <div className="h-72 rounded-xl shimmer" />
      ) : (
        <div className={showCalendar ? "grid gap-6 lg:grid-cols-[300px_1fr]" : "grid gap-6"}>
          {showCalendar && (
            <CalendarPanel selected={selected} entryDates={entryDates} onSelect={selectDate} />
          )}

          <div className="relative" style={{ perspective: 1800 }}>
            <AnimatePresence mode="wait" custom={flipDir}>
              <motion.div
                key={selected}
                custom={flipDir}
                initial={reduce ? { opacity: 0 } : { rotateY: flipDir === 1 ? -80 : 80, opacity: 0 }}
                animate={reduce ? { opacity: 1 } : { rotateY: 0, opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { rotateY: flipDir === 1 ? 80 : -80, opacity: 0 }}
                transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                style={{ transformStyle: "preserve-3d", transformOrigin: "center" }}
              >
                <DiaryPage
                  entry={current}
                  content={content}
                  syncStatus={syncStatus}
                  onChange={handleContentChange}
                />
              </motion.div>
            </AnimatePresence>

            <button
              onClick={older}
              disabled={currentIdx < 0 || currentIdx >= entries.length - 1}
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

            {currentIdx >= 0 ? (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                Page {entries.length - currentIdx} of {entries.length}
              </p>
            ) : (
              <EmptyNotebookHint />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarPanel({
  selected,
  entryDates,
  onSelect,
}: {
  selected: string;
  entryDates: Date[];
  onSelect: (date: string) => void;
}) {
  return (
    <aside className="self-start rounded-xl border border-border bg-card p-3">
      <Calendar
        mode="single"
        selected={parseDate(selected)}
        onSelect={(date) => {
          if (!date) return;
          onSelect(toDateStr(date));
        }}
        modifiers={{ hasEntry: entryDates }}
        modifiersClassNames={{ hasEntry: "bg-primary/15 text-primary font-semibold rounded-md" }}
        className="pointer-events-auto p-0"
      />
      <p className="mt-3 text-xs text-muted-foreground">Highlighted days have a diary page.</p>
    </aside>
  );
}

function EmptyNotebookHint() {
  return (
    <div className="mt-4 rounded-xl border border-border bg-card/50 p-6 text-center">
      <BookOpen className="mx-auto h-8 w-8 text-primary" />
      <p className="mt-3 text-sm text-muted-foreground">Start typing on today's page to create the notebook.</p>
    </div>
  );
}

function DiaryPage({
  entry,
  content,
  syncStatus,
  onChange,
}: {
  entry: Entry;
  content: string;
  syncStatus: SyncStatus;
  onChange: (nextContent: string) => void;
}) {
  const date = parseDate(entry.entry_date);
  const hasLegacyRows = !content && entry.rows?.length > 0;

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-[Caveat] text-3xl font-semibold">{fmtDateLong(date)}</p>
          <SyncBadge status={syncStatus} />
        </div>

        {hasLegacyRows ? (
          <LegacyRowsTable entry={entry} />
        ) : (
          <textarea
            value={content}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Write today's family notes here..."
            spellCheck
            className="mt-4 block min-h-[360px] w-full resize-y border-0 bg-transparent p-0 text-2xl leading-8 outline-none placeholder:text-[#E8D5B0]/35 focus:ring-0"
            style={{
              color: TEXT,
              fontFamily: "Caveat, Patrick Hand, cursive",
              caretColor: TEXT,
            }}
          />
        )}
      </div>
    </div>
  );
}

function SyncBadge({ status }: { status: SyncStatus }) {
  const labels: Record<SyncStatus, string> = {
    synced: "Synced",
    draft: "Autosaving",
    saving: "Saving",
    error: "Sync issue",
  };

  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: HEADER_BG, color: TEXT }}>
      {labels[status]}
    </span>
  );
}

function LegacyRowsTable({ entry }: { entry: Entry }) {
  return (
    <>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm" style={{ fontFamily: "Inter, system-ui, sans-serif", color: TEXT }}>
          <thead>
            <tr className="text-left" style={{ background: HEADER_BG }}>
              <th className="py-2 px-2 w-8 font-semibold">#</th>
              <th className="py-2 px-2 font-semibold">Item</th>
              <th className="py-2 px-2 w-20 font-semibold">Qty</th>
              <th className="py-2 px-2 w-20 font-semibold">Unit</th>
              <th className="py-2 px-2 w-32 font-semibold">Status</th>
              <th className="py-2 px-2 w-12 text-center font-semibold">Done</th>
              <th className="py-2 px-2 w-24 font-semibold">Price</th>
            </tr>
          </thead>
          <tbody>
            {(entry.rows || []).map((row, index) => {
              const price = row.price != null ? String(row.price) : row.amount != null ? String(row.amount) : "";
              return (
                <tr key={index} style={{ borderTop: `1px solid ${RULE_BORDER}` }}>
                  <td className="py-2 px-2 opacity-60">{index + 1}</td>
                  <td className="px-2">{row.item ?? ""}</td>
                  <td className="px-2">{row.qty ?? ""}</td>
                  <td className="px-2">{row.unit ?? ""}</td>
                  <td className="px-2">{(row.status ?? "").replace("_", " ")}</td>
                  <td className="text-center px-2">{row.bought ? "Yes" : ""}</td>
                  <td className="px-2">{price ? `Rs ${price}` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-5 text-sm font-medium">Total Spent: {inr(Number(entry.total_amount) || 0)}</p>
    </>
  );
}
