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
  diary_notes: string;
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
const INK = "#F3E2BC";
const GHOST = "rgba(232,213,176,0.35)";
const UNITS = ["Kg", "Gram", "Litre", "ml", "Piece", "Packet", "Bottle", "Box", "Dozen"];
const MIN_ROWS = 6;

function parseDate(s: string) {
  return new Date(s + "T00:00:00");
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateLong(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function todayDateStr() {
  return toDateStr(new Date());
}

function draftRowsKey(familyId: string, date: string) {
  return `famkart:notebook:${familyId}:${date}:rows`;
}

function draftNotesKey(familyId: string, date: string) {
  return `famkart:notebook:${familyId}:${date}:diary_notes`;
}

function blankEntry(date: string): Entry {
  return {
    id: `draft-${date}`,
    entry_date: date,
    content: "",
    diary_notes: "",
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

function normalizeRows(rows: DiaryRow[] | null | undefined) {
  return (rows ?? []).map((row) => ({
    item: row.item ?? "",
    qty: row.qty ?? "",
    unit: row.unit ?? "",
    bought: Boolean(row.bought),
    price: row.price ?? row.amount ?? "",
  }));
}

function rowsFromEntry(entry: Entry) {
  const normalized = normalizeRows(entry.rows);
  if (normalized.length > 0) return normalized;
  if (!entry.content?.trim()) return [];

  return entry.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ item: line, qty: "", unit: "", bought: false, price: "" }));
}

function visibleRows(rows: DiaryRow[]) {
  const padded = [...rows];
  while (padded.length < MIN_ROWS) padded.push({ item: "", qty: "", unit: "", bought: false, price: "" });
  return padded;
}

function compactRows(rows: DiaryRow[]) {
  return rows
    .map((row) => ({
      item: row.item?.trim() ?? "",
      qty: row.qty != null ? String(row.qty).trim() : "",
      unit: row.unit?.trim() ?? "",
      bought: Boolean(row.bought),
      price: row.price != null ? String(row.price).trim() : "",
    }))
    .filter((row) => row.item || row.qty || row.unit || row.bought || row.price);
}

function rowsSignature(rows: DiaryRow[]) {
  return JSON.stringify(compactRows(rows));
}

function totalAmount(rows: DiaryRow[]) {
  return compactRows(rows).reduce((sum, row) => {
    const raw = String(row.price ?? "").replace(/[^\d.]/g, "");
    return sum + (Number(raw) || 0);
  }, 0);
}

function notesFromEntry(entry: Entry) {
  return entry.diary_notes ?? "";
}

function memberName(profileName: string | null | undefined, email: string | undefined) {
  const source = profileName?.trim() || email?.split("@")[0] || "there";
  return source.split(/\s+/)[0] || source;
}

function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 12) return "Good Morning";
  if (hour >= 12 && hour < 17) return "Good Afternoon";
  if (hour >= 17 && hour < 21) return "Good Evening";
  return "Good Night";
}

export function FamilyNotebook({
  showHeader = true,
  showBackButton = true,
  dashboardLink = true,
  showCalendar = true,
}: FamilyNotebookProps) {
  const { family, profile, user } = useAuth();
  const reduce = useReducedMotion();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(todayDateStr());
  const [rows, setRows] = useState<DiaryRow[]>([]);
  const [diaryNotes, setDiaryNotes] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [flipDir, setFlipDir] = useState<1 | -1>(1);
  const [headerAnimated, setHeaderAnimated] = useState(false);
  const [currentHour, setCurrentHour] = useState(new Date().getHours());

  const serverRowsRef = useRef("");
  const serverNotesRef = useRef("");
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef<{ rows: DiaryRow[]; diaryNotes: string } | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const selectedRef = useRef(selected);
  const rowsRef = useRef(rows);
  const diaryNotesRef = useRef(diaryNotes);
  const syncStatusRef = useRef(syncStatus);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    diaryNotesRef.current = diaryNotes;
  }, [diaryNotes]);

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
  const greeting = `${greetingForHour(currentHour)}, ${memberName(profile?.full_name, user?.email)}`;

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const applyEntryToEditor = (entry: Entry, familyId: string) => {
    const serverRows = rowsFromEntry(entry);
    const serverSig = rowsSignature(serverRows);
    const serverNotes = notesFromEntry(entry);
    const cachedRowsDraft = localStorage.getItem(draftRowsKey(familyId, entry.entry_date));
    const cachedNotesDraft = localStorage.getItem(draftNotesKey(familyId, entry.entry_date));

    serverRowsRef.current = serverSig;
    serverNotesRef.current = serverNotes;

    if (cachedRowsDraft !== null && cachedRowsDraft !== serverSig) {
      try {
        setRows(JSON.parse(cachedRowsDraft) as DiaryRow[]);
        setSyncStatus("draft");
      } catch {
        localStorage.removeItem(draftRowsKey(familyId, entry.entry_date));
      }
    } else {
      setRows(serverRows);
    }

    if (cachedNotesDraft !== null && cachedNotesDraft !== serverNotes) {
      setDiaryNotes(cachedNotesDraft);
      setSyncStatus("draft");
    } else {
      setDiaryNotes(serverNotes);
      if (cachedRowsDraft === null || cachedRowsDraft === serverSig) setSyncStatus("synced");
    }
  };

  const loadEntries = async () => {
    if (!family?.id) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("notebook_entries")
      .select("id,entry_date,content,diary_notes,rows,total_amount,user_id,updated_by")
      .eq("family_id", family.id)
      .order("entry_date", { ascending: false });

    if (error) {
      toast.error(friendlyError(error));
      setSyncStatus("error");
      setLoading(false);
      return;
    }

    const today = todayDateStr();
    const list = sortEntries((data as unknown as Entry[]) ?? []);
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

          setEntries((prev) => upsertEntry(prev, incoming));

          if (incoming.entry_date === selectedRef.current && incoming.updated_by !== user?.id) {
            const incomingRows = rowsFromEntry(incoming);
            const incomingSig = rowsSignature(incomingRows);
            const incomingNotes = notesFromEntry(incoming);
            serverRowsRef.current = incomingSig;
            serverNotesRef.current = incomingNotes;

            if (
              syncStatusRef.current === "synced" ||
              (rowsSignature(rowsRef.current) === incomingSig && diaryNotesRef.current === incomingNotes)
            ) {
              localStorage.removeItem(draftRowsKey(family.id, incoming.entry_date));
              localStorage.removeItem(draftNotesKey(family.id, incoming.entry_date));
              setRows(incomingRows);
              setDiaryNotes(incomingNotes);
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

  const executeSave = async (rowsToSave: DiaryRow[], notesToSave: string, dateToSave: string) => {
    if (!family?.id || !user?.id) return;

    isSavingRef.current = true;
    setSyncStatus("saving");

    const cleanRows = compactRows(rowsToSave);
    const existing = entryByDate[dateToSave];
    const payload = {
      family_id: family.id,
      user_id: existing?.user_id || user.id,
      entry_date: dateToSave,
      content: "",
      diary_notes: notesToSave,
      rows: cleanRows,
      total_amount: totalAmount(cleanRows),
      updated_by: user.id,
    };

    const { data, error } = await supabase
      .from("notebook_entries")
      .upsert(payload, { onConflict: "family_id,entry_date" })
      .select("id,entry_date,content,diary_notes,rows,total_amount,user_id,updated_by")
      .single();

    if (error) {
      toast.error(friendlyError(error));
      setSyncStatus("error");
    } else if (data) {
      const saved = data as unknown as Entry;
      const savedRows = rowsFromEntry(saved);
      const savedNotes = notesFromEntry(saved);
      serverRowsRef.current = rowsSignature(savedRows);
      serverNotesRef.current = savedNotes;
      localStorage.removeItem(draftRowsKey(family.id, dateToSave));
      localStorage.removeItem(draftNotesKey(family.id, dateToSave));
      setEntries((prev) => upsertEntry(prev, { ...saved, rows: savedRows }));
      setSyncStatus("synced");
    }

    isSavingRef.current = false;
    if (pendingSaveRef.current !== null) {
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      executeSave(pending.rows, pending.diaryNotes, dateToSave);
    }
  };

  const queueSave = (nextRows: DiaryRow[], nextNotes: string, dateToSave: string) => {
    if (rowsSignature(nextRows) === serverRowsRef.current && nextNotes === serverNotesRef.current) {
      setSyncStatus("synced");
      if (family?.id) {
        localStorage.removeItem(draftRowsKey(family.id, dateToSave));
        localStorage.removeItem(draftNotesKey(family.id, dateToSave));
      }
      return;
    }

    if (isSavingRef.current) {
      pendingSaveRef.current = { rows: nextRows, diaryNotes: nextNotes };
      return;
    }

    executeSave(nextRows, nextNotes, dateToSave);
  };

  const handleRowsChange = (nextRows: DiaryRow[]) => {
    if (!family?.id) return;

    rowsRef.current = nextRows;
    setRows(nextRows);
    setSyncStatus("draft");
    localStorage.setItem(draftRowsKey(family.id, selected), JSON.stringify(nextRows));
    setEntries((prev) => upsertEntry(prev, {
      ...current,
      rows: compactRows(nextRows),
      diary_notes: diaryNotesRef.current,
      total_amount: totalAmount(nextRows),
    }));

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      queueSave(nextRows, diaryNotesRef.current, selected);
    }, 2000);
  };

  const handleDiaryNotesChange = (nextNotes: string) => {
    if (!family?.id) return;

    diaryNotesRef.current = nextNotes;
    setDiaryNotes(nextNotes);
    setSyncStatus("draft");
    localStorage.setItem(draftNotesKey(family.id, selected), nextNotes);
    setEntries((prev) => upsertEntry(prev, { ...current, diary_notes: nextNotes }));

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      queueSave(rowsRef.current, nextNotes, selected);
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
                  greeting={greeting}
                  rows={rows}
                  diaryNotes={diaryNotes}
                  syncStatus={syncStatus}
                  reduceMotion={Boolean(reduce)}
                  animateHeader={!headerAnimated}
                  onHeaderDone={() => setHeaderAnimated(true)}
                  onRowsChange={handleRowsChange}
                  onDiaryNotesChange={handleDiaryNotesChange}
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
  greeting,
  rows,
  diaryNotes,
  syncStatus,
  reduceMotion,
  animateHeader,
  onHeaderDone,
  onRowsChange,
  onDiaryNotesChange,
}: {
  entry: Entry;
  greeting: string;
  rows: DiaryRow[];
  diaryNotes: string;
  syncStatus: SyncStatus;
  reduceMotion: boolean;
  animateHeader: boolean;
  onHeaderDone: () => void;
  onRowsChange: (nextRows: DiaryRow[]) => void;
  onDiaryNotesChange: (nextNotes: string) => void;
}) {
  const date = parseDate(entry.entry_date);
  const [greetingDone, setGreetingDone] = useState(!animateHeader || reduceMotion);

  useEffect(() => {
    if (!animateHeader || reduceMotion) setGreetingDone(true);
  }, [animateHeader, reduceMotion]);

  const patchRow = (index: number, patch: Partial<DiaryRow>) => {
    const next = visibleRows(rows);
    next[index] = { ...next[index], ...patch };
    onRowsChange(next);
  };

  const addRow = () => {
    onRowsChange([...visibleRows(rows), { item: "", qty: "", unit: "", bought: false, price: "" }]);
  };

  return (
    <div
      className="rounded-md border p-5 md:p-8"
      style={{
        background: PAPER,
        color: TEXT,
        borderColor: "rgba(255,220,150,0.1)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 39px, ${RULE} 39px, ${RULE} 40px)`,
      }}
    >
      <div className="relative pl-9 md:pl-14">
        <span
          className="pointer-events-none absolute top-0 bottom-0 left-6 md:left-10 w-[2px]"
          style={{ background: MARGIN }}
        />
        <div className="min-h-[94px]">
          <div className="flex items-start justify-between gap-3">
            <p className="min-h-[44px] font-[Caveat] text-4xl font-semibold leading-tight md:text-5xl">
              <TypewriterText
                text={greeting}
                delayMs={44}
                disabled={!animateHeader || reduceMotion}
                onDone={() => {
                  setGreetingDone(true);
                }}
              />
            </p>
            <SyncBadge status={syncStatus} />
          </div>
          <p className="mt-1 min-h-[32px] text-right font-[Caveat] text-2xl font-medium md:text-3xl">
            {greetingDone && (
              <TypewriterText
                text={fmtDateLong(date)}
                delayMs={30}
                disabled={!animateHeader || reduceMotion}
                onDone={onHeaderDone}
              />
            )}
          </p>
        </div>

        <ShoppingRowsTable rows={visibleRows(rows)} onPatchRow={patchRow} />
        <button
          type="button"
          onClick={addRow}
          className="mt-4 font-[Caveat] text-2xl transition hover:brightness-125"
          style={{ color: INK }}
        >
          + Add another item
        </button>
        <div className="my-5 flex items-center gap-4" style={{ color: GHOST }}>
          <span className="h-px flex-1" style={{ background: RULE_BORDER }} />
          <span className="font-[Caveat] text-2xl" style={{ color: TEXT }}>Family Notes</span>
          <span className="h-px flex-1" style={{ background: RULE_BORDER }} />
        </div>
        <textarea
          value={diaryNotes}
          onChange={(event) => onDiaryNotesChange(event.target.value)}
          placeholder="Milkman already came. Don't forget electricity bill tomorrow..."
          className="block min-h-[180px] w-full resize-y border-0 bg-transparent p-0 font-[Caveat] text-2xl leading-10 outline-none placeholder:text-[#E8D5B0]/35 md:text-3xl"
          style={{ color: INK, caretColor: INK }}
        />
        <p className="mt-5 text-sm font-medium">Total Spent: {inr(totalAmount(rows))}</p>
      </div>
    </div>
  );
}

function TypewriterText({
  text,
  delayMs,
  disabled,
  onDone,
}: {
  text: string;
  delayMs: number;
  disabled: boolean;
  onDone?: () => void;
}) {
  const [shown, setShown] = useState(disabled ? text : "");
  const startedFor = useRef(text);

  useEffect(() => {
    if (disabled) {
      setShown(text);
      onDone?.();
      return;
    }

    if (startedFor.current !== text) return;

    setShown("");
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setShown(text.slice(0, index));
      if (index >= text.length) {
        window.clearInterval(timer);
        onDone?.();
      }
    }, delayMs);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{shown}</>;
}

function ShoppingRowsTable({
  rows,
  onPatchRow,
}: {
  rows: DiaryRow[];
  onPatchRow: (index: number, patch: Partial<DiaryRow>) => void;
}) {
  return (
    <div className="mt-4 overflow-x-auto pb-1">
      <table className="w-full min-w-[720px] text-sm md:text-base" style={{ fontFamily: "Inter, system-ui, sans-serif", color: TEXT }}>
        <thead>
          <tr className="text-left" style={{ background: HEADER_BG }}>
            <th className="py-2 px-2 w-8 font-semibold">#</th>
            <th className="py-2 px-2 font-semibold">Item Name</th>
            <th className="py-2 px-2 w-24 font-semibold">Quantity</th>
            <th className="py-2 px-2 w-32 font-semibold">Unit</th>
            <th className="py-2 px-2 w-20 text-center font-semibold">Bought</th>
            <th className="py-2 px-2 w-28 font-semibold">Price</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} style={{ borderTop: `1px solid ${RULE_BORDER}` }}>
              <td className="py-2 px-2 opacity-60">{index + 1}</td>
              <td className="px-2">
                <NotebookInput
                  value={row.item ?? ""}
                  placeholder="Rice"
                  className="text-2xl"
                  onChange={(value) => onPatchRow(index, { item: value })}
                />
              </td>
              <td className="px-2">
                <NotebookInput
                  value={row.qty != null ? String(row.qty) : ""}
                  placeholder="2"
                  inputMode="decimal"
                  onChange={(value) => onPatchRow(index, { qty: value })}
                />
              </td>
              <td className="px-2">
                <select
                  value={row.unit ?? ""}
                  onChange={(event) => onPatchRow(index, { unit: event.target.value })}
                  className="w-full rounded-none border-0 bg-transparent px-0 py-1 text-base outline-none"
                  style={{ color: row.unit ? INK : GHOST }}
                >
                  <option value="">Unit</option>
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-2 text-center">
                <input
                  type="checkbox"
                  checked={Boolean(row.bought)}
                  onChange={(event) => onPatchRow(index, { bought: event.target.checked })}
                  className="h-5 w-5 accent-[#E8D5B0]"
                  aria-label={`Bought row ${index + 1}`}
                />
              </td>
              <td className="px-2">
                <NotebookInput
                  value={row.price != null ? String(row.price) : ""}
                  placeholder="₹120"
                  inputMode="decimal"
                  onChange={(value) => onPatchRow(index, { price: value })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NotebookInput({
  value,
  placeholder,
  className = "",
  inputMode,
  onChange,
}: {
  value: string;
  placeholder: string;
  className?: string;
  inputMode?: "decimal";
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      inputMode={inputMode}
      onChange={(event) => onChange(event.target.value)}
      className={`w-full border-0 bg-transparent px-0 py-1 font-[Caveat] leading-8 outline-none placeholder:text-[#E8D5B0]/35 ${className}`}
      style={{ color: INK, caretColor: INK }}
    />
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
