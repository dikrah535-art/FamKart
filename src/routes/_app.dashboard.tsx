import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { inr } from "@/lib/format";
import { CategoryIcon } from "@/components/CategoryIcon";
import { TodayDiary } from "@/components/TodayDiary";
import { requeueRecurringItems } from "@/lib/recurring";

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard });

type Item = {
  id: string; name: string; status: string; priority: string;
  category_id: string | null; assigned_to: string | null; created_at: string;
};
type Cat = { id: string; name: string; icon: string; color: string };

function Dashboard() {
  const { family, user } = useAuth();
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [purchasedTotal, setPurchasedTotal] = useState(0);

  const load = async () => {
    if (!family) return;
    const [it, ct, ph] = await Promise.all([
      supabase
        .from("items")
        .select("id,name,status,priority,category_id,assigned_to,created_at")
        .eq("family_id", family.id)
        .order("created_at", { ascending: false }),
      supabase.from("categories").select("id,name,icon,color").eq("family_id", family.id),
      supabase
        .from("purchase_history")
        .select("cost,purchased_at")
        .eq("family_id", family.id)
        .gte(
          "purchased_at",
          new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
        ),
    ]);
    setItems((it.data as Item[]) ?? []);
    setCats((ct.data as Cat[]) ?? []);
    setPurchasedTotal(
      (ph.data ?? []).reduce(
        (s, r: { cost: number | null }) => s + (Number(r.cost) || 0),
        0
      )
    );
  };

  useEffect(() => { load(); }, [family]);

  // Re-queue recurring items whose interval has elapsed
  useEffect(() => {
    if (!family) return;
    requeueRecurringItems(family.id).then(load);
  }, [family]);

  useEffect(() => {
    if (!family) return;
    const ch = supabase
      .channel(`dash:${family.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items", filter: `family_id=eq.${family.id}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [family]);

  const needed = items.filter((i) => i.status === "needed").length;
  const urgent = items.filter((i) => i.priority === "urgent" && i.status !== "stocked").length;
  const low = items.filter((i) => i.status === "low_stock").length;
  const budgetUsed = family?.monthly_budget
    ? Math.round((purchasedTotal / Number(family.monthly_budget)) * 100)
    : 0;
  const budgetLabel = family?.monthly_budget ? `${budgetUsed}%` : inr(purchasedTotal);

  const urgentItems = items
    .filter((i) => i.priority === "urgent" && i.status !== "stocked")
    .slice(0, 8);
  const myItems = items
    .filter((i) => i.assigned_to === user?.id && i.status !== "stocked")
    .slice(0, 5);
  const recent = items.slice(0, 5);

  return (
    <div className="space-y-8">
      <TodayDiary />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <NeededStat value={needed} onClick={() => navigate({ to: "/items", search: { tab: "needed" } })} reduce={!!reduce} />
        <UrgentStat value={urgent} onClick={() => navigate({ to: "/items", search: { tab: "urgent" } })} reduce={!!reduce} />
        <LowStockStat value={low} onClick={() => navigate({ to: "/items", search: { tab: "low_stock" } })} reduce={!!reduce} />
        <BudgetStat value={budgetLabel} onClick={() => navigate({ to: "/budget" })} reduce={!!reduce} />
      </section>

      {urgentItems.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Urgent items</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {urgentItems.map((i) => (
              <Link
                key={i.id}
                to="/items"
                search={{ tab: "urgent" }}
                className="min-w-[200px] rounded-xl border border-destructive/40 bg-destructive/5 p-4 transition hover:-translate-y-0.5 hover:bg-destructive/10"
              >
                <span className="inline-flex rounded-full bg-destructive/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-destructive">
                  Urgent
                </span>
                <p className="mt-2 font-semibold">{i.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {i.status.replace("_", " ")}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Categories</h2>
          <Link to="/categories" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            All <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {cats.map((c) => {
            const inCat = items.filter((i) => i.category_id === c.id);
            const stocked = inCat.filter((i) => i.status === "stocked").length;
            const pct = inCat.length ? Math.round((stocked / inCat.length) * 100) : 0;
            return (
              <motion.div
                key={c.id}
                initial={reduce ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * cats.indexOf(c), duration: 0.3 }}
              >
                <Link
                  to="/category/$id"
                  params={{ id: c.id }}
                  className="card-glow block rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-center justify-between">
                    <CategoryIcon name={c.name} color={c.color} size={26} />
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs">{inCat.length}</span>
                  </div>
                  <p className="mt-2 font-semibold">{c.name}</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-accent">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recently added</h2>
          <div className="space-y-2">
            {recent.length === 0 && <EmptyHint text="Nothing yet — press N to quick-add." />}
            {recent.map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                <span className="font-medium">{i.name}</span>
                <StatusPill status={i.status} />
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-lg font-semibold">Assigned to me</h2>
          <div className="space-y-2">
            {myItems.length === 0 && <EmptyHint text="You're all caught up! 🎉" />}
            {myItems.map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                <span className="font-medium">{i.name}</span>
                <StatusPill status={i.status} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
      <div className="float text-3xl">🌿</div>
      <p className="mt-2">{text}</p>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    needed: "bg-destructive/15 text-destructive",
    low_stock: "bg-warning/15 text-warning",
    stocked: "bg-primary/15 text-primary",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
        map[status] ?? "bg-accent"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

/* ============ Animated Stat Cards ============ */

function StatShell({
  label, value, onClick, glow, hovering, setHovering, children,
}: {
  label: string; value: number | string; onClick: () => void; glow: string;
  hovering: boolean; setHovering: (b: boolean) => void; children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="relative overflow-hidden rounded-xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{
        borderColor: hovering ? glow : "var(--color-border)",
        boxShadow: hovering ? `0 0 20px ${glow}66` : undefined,
        minHeight: 110,
      }}
    >
      {children}
      <div className="relative">
        <span className="text-xs text-muted-foreground">{label}</span>
        <p className="mt-2 text-2xl font-bold">{value}</p>
      </div>
    </button>
  );
}

function NeededStat({ value, onClick, reduce }: { value: number; onClick: () => void; reduce: boolean }) {
  const [h, setH] = useState(false);
  return (
    <StatShell label="Items needed" value={value} onClick={onClick} glow="#3ECF8E" hovering={h} setHovering={setH}>
      <div
        className="cardbox"
        style={{ position: "absolute", top: 10, right: 10, width: 38, height: 38, perspective: 220 }}
      >
        <div
          style={{
            position: "absolute", bottom: 0, width: 38, height: 24,
            background: "linear-gradient(150deg,#D97706,#92400E)",
            borderRadius: "0 0 5px 5px",
          }}
        />
        <div
          style={{
            position: "absolute", bottom: 0, left: "50%", width: 2, height: 24,
            background: "#92400E", transform: "translateX(-50%)",
          }}
        />
        <div
          style={{
            position: "absolute", top: 0, left: 0, width: 19, height: 15,
            background: "#F59E0B", borderRadius: "3px 0 0 0",
            transformOrigin: "bottom left",
            animation: !reduce && h ? "cbFL 1.8s ease-in-out infinite" : undefined,
          }}
        />
        <div
          style={{
            position: "absolute", top: 0, right: 0, width: 19, height: 15,
            background: "#F59E0B", borderRadius: "0 3px 0 0",
            transformOrigin: "bottom right",
            animation: !reduce && h ? "cbFR 1.8s ease-in-out infinite" : undefined,
          }}
        />
      </div>
      <style>{`
        @keyframes cbFL { 0%,100%{transform:rotateY(0)} 22%{transform:rotateY(-125deg)} 62%{transform:rotateY(-125deg)} 82%{transform:rotateY(0)} }
        @keyframes cbFR { 0%,100%{transform:rotateY(0)} 22%{transform:rotateY(125deg)} 62%{transform:rotateY(125deg)} 82%{transform:rotateY(0)} }
        @keyframes wLeft { 0%{transform:rotateY(0deg)} 100%{transform:rotateY(-140deg)} }
      `}</style>
    </StatShell>
  );
}

function UrgentStat({ value, onClick, reduce }: { value: number; onClick: () => void; reduce: boolean }) {
  const [h, setH] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!h || reduce) return;
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const r = c.getBoundingClientRect();
      c.width = r.width * dpr;
      c.height = r.height * dpr;
    };
    resize();
    const ctx = c.getContext("2d");
    if (!ctx) return;
    type Ring = { t: number; max: number };
    const rings: Ring[] = [];
    let last = performance.now();
    let lastSpawn = -Infinity;
    let raf = 0;
    const LIFE = 1800;
    const SPAWN = 1100;
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      ctx.clearRect(0, 0, c.width, c.height);
      const w = c.width / dpr;
      const hh = c.height / dpr;
      if (now - lastSpawn > SPAWN) {
        rings.push({ t: 0, max: Math.hypot(w, hh) });
        lastSpawn = now;
      }
      const cx = (w - 14) * dpr;
      const cy = 14 * dpr;
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.t += dt;
        const p = r.t / LIFE;
        if (p >= 1) { rings.splice(i, 1); continue; }
        const radius = p * r.max * dpr;
        const alpha = (1 - p) * 0.65;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        g.addColorStop(0, `rgba(239,68,68,${alpha})`);
        g.addColorStop(1, "rgba(239,68,68,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [h, reduce]);

  return (
    <StatShell label="Urgent" value={value} onClick={onClick} glow="#EF4444" hovering={h} setHovering={setH}>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <svg
        width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className="absolute right-3 top-3"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </StatShell>
  );
}

function LowStockStat({ value, onClick, reduce }: { value: number; onClick: () => void; reduce: boolean }) {
  const [h, setH] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (reduce) return;
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const r = c.getBoundingClientRect();
      c.width = r.width * dpr;
      c.height = r.height * dpr;
    };
    resize();
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const SEGMENTS = 8;
    const baseY = (i: number) => (i / (SEGMENTS - 1)) * 0.8 + 0.05;
    const t0 = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      const w = c.width;
      const hh = c.height;
      ctx.clearRect(0, 0, w, hh);
      // grid
      ctx.strokeStyle = "rgba(245,158,11,0.12)";
      ctx.lineWidth = 1 * dpr;
      for (let i = 1; i < 4; i++) {
        const y = (i / 4) * hh;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      const elapsed = (now - t0) / 1000;
      const cycle = 4;
      const p = Math.min(1, (elapsed % cycle) / (cycle * 0.85));
      const points: [number, number][] = [];
      for (let i = 0; i < SEGMENTS; i++) {
        const wob = Math.sin(i * 1.7) * 0.06;
        const x = (i / (SEGMENTS - 1)) * w;
        const y = (baseY(i) + wob) * hh;
        points.push([x, y]);
      }
      const totalLen = points.length - 1;
      const drawUpTo = totalLen * p;
      ctx.strokeStyle = "#F59E0B";
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      let tipX = points[0][0];
      let tipY = points[0][1];
      for (let i = 1; i < points.length; i++) {
        if (i <= drawUpTo) {
          ctx.lineTo(points[i][0], points[i][1]);
          tipX = points[i][0];
          tipY = points[i][1];
        } else {
          const frac = drawUpTo - (i - 1);
          if (frac > 0) {
            const x = points[i - 1][0] + (points[i][0] - points[i - 1][0]) * frac;
            const y = points[i - 1][1] + (points[i][1] - points[i - 1][1]) * frac;
            ctx.lineTo(x, y);
            tipX = x;
            tipY = y;
          }
          break;
        }
      }
      ctx.stroke();
      ctx.shadowColor = "#F59E0B";
      ctx.shadowBlur = 8 * dpr;
      ctx.fillStyle = "#F59E0B";
      const a = 7 * dpr;
      ctx.beginPath();
      ctx.moveTo(tipX - a, tipY - a);
      ctx.lineTo(tipX + a, tipY - a);
      ctx.lineTo(tipX, tipY + a);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [reduce]);

  return (
    <StatShell label="Low stock" value={value} onClick={onClick} glow="#F59E0B" hovering={h} setHovering={setH}>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute"
        style={{ right: 0, bottom: 0, width: "60%", height: "65%" }}
      />
    </StatShell>
  );
}

function BudgetStat({ value, onClick, reduce }: { value: string; onClick: () => void; reduce: boolean }) {
  const [h, setH] = useState(false);
  return (
    <StatShell label="Budget used" value={value} onClick={onClick} glow="#7C3AED" hovering={h} setHovering={setH}>
      <div className="absolute right-3 top-3 h-9 w-11" style={{ perspective: 90 }}>
        {/* Wallet body */}
        <div
          className="absolute inset-x-0 bottom-0 h-6 rounded-sm"
          style={{ background: "#7C3AED" }}
        />
        {/* Wallet flap */}
        <motion.div
          className="absolute inset-x-0 top-0 h-4 rounded-t-sm origin-bottom"
          style={{ background: "#9F67FF" }}
          animate={!reduce && h ? { rotateX: -150 } : { rotateX: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        />
        {/* Rain notes (after flap opens) */}
        {!reduce && h && Array.from({ length: 4 }).map((_, i) => (
          <motion.div
            key={i}
            className="pointer-events-none absolute grid place-items-center rounded-sm text-[8px] font-bold"
            style={{
              width: 14, height: 9,
              background: "#1a3d2b",
              border: "1px solid #3ECF8E",
              color: "#3ECF8E",
              left: 2 + (i % 2) * 12,
              top: 6,
            }}
            initial={{ y: 0, opacity: 0, rotate: 0 }}
            animate={{
              y: 40,
              opacity: [0, 1, 1, 0],
              rotate: (i % 2 === 0 ? 1 : -1) * 30,
            }}
            transition={{
              delay: 0.5 + i * 0.35,
              duration: 1.6,
              repeat: Infinity,
              repeatDelay: 0.6,
              ease: "easeIn",
            }}
          >
            ₹
          </motion.div>
        ))}
      </div>
    </StatShell>
  );
}
