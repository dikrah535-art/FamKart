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
          "2026-06-01T00:00:00.000Z"
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "purchase_history", filter: `family_id=eq.${family.id}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "families", filter: `id=eq.${family.id}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [family]);

  // Global Stat Counters
  const needed = items.filter((i) => i.status === "needed").length;
  const urgent = items.filter((i) => i.priority === "urgent" && i.status !== "bought" && i.status !== "stocked").length;
  const low = items.filter((i) => i.status === "low_stock").length;
  
  const budgetUsed = family?.monthly_budget
    ? Math.round((purchasedTotal / Number(family.monthly_budget)) * 100)
    : 0;
  const budgetLabel = family?.monthly_budget ? `${budgetUsed}%` : inr(purchasedTotal);

  const urgentItems = items
    .filter((i) => i.priority === "urgent" && i.status !== "bought" && i.status !== "stocked")
    .slice(0, 8);
  
  // Real-time feeds filtered to ignore anything bought or stocked
  const myItems = items
    .filter((i) => i.assigned_to === user?.id && i.status !== "bought" && i.status !== "stocked")
    .slice(0, 5);
  const recent = items
    .filter((i) => i.status !== "bought" && i.status !== "stocked")
    .slice(0, 5);

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
            
            // STRICT DEFINITION: Active means it requires restocking right now
            const active = inCat.filter(
              (i) => i.status === "needed" || i.status === "low_stock" || (i.priority === "urgent" && i.status !== "bought" && i.status !== "stocked")
            );
            const activeCount = active.length;
            const hasActive = activeCount > 0;
            
            const stocked = inCat.filter((i) => i.status === "stocked" || i.status === "bought").length;
            const pct = inCat.length ? Math.round((stocked / inCat.length) * 100) : 0;
            
            return (
              <motion.div
                key={c.id}
                initial={reduce ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * cats.indexOf(c), duration: 0.3 }}
                layout
              >
                <Link
                  to="/category/$id"
                  params={{ id: c.id }}
                  className="card-glow block rounded-xl border bg-card p-4 transition-colors duration-500"
                  style={{
                    borderColor: hasActive ? "#3ECF8E" : "var(--color-border)",
                    boxShadow: hasActive ? "0 0 0 1px rgba(62,207,142,0.25), 0 0 14px rgba(62,207,142,0.18)" : undefined,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <CategoryIcon name={c.name} color={c.color} size={26} />
                    <span
                      className="rounded-full px-2 py-0.5 text-xs transition-colors duration-500"
                      style={{
                        background: hasActive ? "rgba(62,207,142,0.15)" : "var(--color-accent)",
                        color: hasActive ? "#3ECF8E" : undefined,
                      }}
                    >
                      {activeCount}
                    </span>
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
    bought: "bg-primary/15 text-primary",
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
    type Ring = { r: number; maxR: number; spd: number };
    const rings: Ring[] = [];
    let raf = 0;
    let frame = 0;
    const loop = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      const w = c.width;
      const hh = c.height;
      const tx = w - 20 * dpr;
      const ty = 20 * dpr;
      const maxR = Math.max(
        Math.hypot(tx, ty),
        Math.hypot(w - tx, ty),
        Math.hypot(tx, hh - ty),
        Math.hypot(w - tx, hh - ty),
      );
      if (frame % 65 === 0) rings.push({ r: 4 * dpr, maxR, spd: maxR / 95 });
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i];
        ring.r += ring.spd;
        if (ring.r >= ring.maxR) { rings.splice(i, 1); continue; }
        const op = 0.65 * (1 - ring.r / ring.maxR);
        const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, ring.r);
        g.addColorStop(0, `rgba(239,68,68,${op * 0.4})`);
        g.addColorStop(0.45, `rgba(239,68,68,${op})`);
        g.addColorStop(1, "rgba(239,68,68,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(tx, ty, ring.r, 0, Math.PI * 2);
        ctx.fill();
      }
      frame++;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [h, reduce]);

  return (
    <StatShell label="Urgent" value={value} onClick={onClick} glow="#EF4444" hovering={h} setHovering={setH}>
      <canvas
        ref={canvasRef}
        className="pointer-events-none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      <span
        className="absolute"
        style={{
          right: 10, top: 6, fontSize: 22, zIndex: 3,
          filter: h ? "drop-shadow(0 0 10px #EF4444)" : "none",
          transition: "filter 0.2s",
        }}
      >
        ⚠️
      </span>
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
    const pts: [number, number][] = [
      [0.02, 0.12], [0.1, 0.06], [0.2, 0.22], [0.3, 0.13], [0.42, 0.34],
      [0.53, 0.22], [0.63, 0.47], [0.74, 0.34], [0.83, 0.58], [0.91, 0.47], [1, 0.82],
    ];
    let sp = 0;
    let raf = 0;
    const draw = () => {
      const w = c.width;
      const hh = c.height;
      ctx.clearRect(0, 0, w, hh);
      ctx.strokeStyle = "rgba(245,158,11,0.10)";
      ctx.lineWidth = 0.5 * dpr;
      for (let i = 1; i < 4; i++) {
        const y = (i / 4) * hh;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      const abs = pts.map(([x, y]) => [x * w, y * hh] as [number, number]);
      const total = abs.length - 1;
      const upto = total * Math.min(1, sp);
      ctx.strokeStyle = "#F59E0B";
      ctx.lineWidth = 2.2 * dpr;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(abs[0][0], abs[0][1]);
      let tipX = abs[0][0], tipY = abs[0][1], prevX = abs[0][0], prevY = abs[0][1];
      for (let i = 1; i < abs.length; i++) {
        if (i <= upto) {
          prevX = abs[i - 1][0]; prevY = abs[i - 1][1];
          ctx.lineTo(abs[i][0], abs[i][1]);
          tipX = abs[i][0]; tipY = abs[i][1];
        } else {
          const frac = upto - (i - 1);
          if (frac > 0) {
            prevX = abs[i - 1][0]; prevY = abs[i - 1][1];
            tipX = prevX + (abs[i][0] - prevX) * frac;
            tipY = prevY + (abs[i][1] - prevY) * frac;
            ctx.lineTo(tipX, tipY);
          }
          break;
        }
      }
      ctx.stroke();
      // glow
      ctx.fillStyle = "rgba(245,158,11,0.2)";
      ctx.beginPath();
      ctx.arc(tipX, tipY, 9 * dpr, 0, Math.PI * 2);
      ctx.fill();
      // directional arrow
      const angle = Math.atan2(tipY - prevY, tipX - prevX);
      const a = 9 * dpr;
      ctx.save();
      ctx.translate(tipX, tipY);
      ctx.rotate(angle);
      ctx.fillStyle = "#F59E0B";
      ctx.beginPath();
      ctx.moveTo(a, 0);
      ctx.lineTo(-a * 0.7, -a * 0.6);
      ctx.lineTo(-a * 0.7, a * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      sp += 0.007;
      if (sp >= 1) sp = 0;
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
        style={{ right: 0, bottom: 0, width: "100%", height: "60%" }}
      />
    </StatShell>
  );
}

function BudgetStat({ value, onClick, reduce }: { value: string; onClick: () => void; reduce: boolean }) {
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
    type Note = { x: number; y: number; vx: number; vy: number; r: number; rs: number; s: number };
    const notes: Note[] = [];
    let raf = 0;
    let frame = 0;
    const DELAY = Math.ceil((650 / 1000) * 60);
    const loop = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      const ox = c.width - 28 * dpr;
      const oy = 16 * dpr;
      if (frame > DELAY && Math.random() < 0.30) {
        notes.push({
          x: ox, y: oy,
          vx: (Math.random() - 0.5) * 1.1 * dpr,
          vy: (0.9 + Math.random() * 1.6) * dpr,
          r: Math.random() * Math.PI * 2,
          rs: (Math.random() - 0.5) * 2.5 * (Math.PI / 180),
          s: 8 + Math.random() * 4,
        });
      }
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        n.vy += 0.018 * dpr;
        n.x += n.vx;
        n.y += n.vy;
        n.r += n.rs;
        if (n.y > c.height + 20) { notes.splice(i, 1); continue; }
        const w = n.s * 1.6 * dpr;
        const hgt = n.s * dpr;
        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.rotate(n.r);
        ctx.shadowColor = "rgba(62,207,142,0.35)";
        ctx.shadowBlur = 5;
        ctx.fillStyle = "#152b20";
        ctx.strokeStyle = "#3ECF8E";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(-w / 2, -hgt / 2, w, hgt);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        // inner borders
        ctx.strokeStyle = "rgba(62,207,142,0.45)";
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 2, -hgt / 2 + 2);
        ctx.lineTo(w / 2 - 2, -hgt / 2 + 2);
        ctx.moveTo(-w / 2 + 2, hgt / 2 - 2);
        ctx.lineTo(w / 2 - 2, hgt / 2 - 2);
        ctx.stroke();
        // ₹ symbol
        ctx.fillStyle = "#3ECF8E";
        ctx.font = `bold ${Math.round(n.s)}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("₹", 0, 0);
        ctx.restore();
      }
      frame++;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [h, reduce]);

  return (
    <StatShell label="Budget used" value={value} onClick={onClick} glow="#7C3AED" hovering={h} setHovering={setH}>
      <canvas
        ref={canvasRef}
        className="pointer-events-none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      <div
        style={{
          position: "absolute", top: 9, right: 9,
          width: 36, height: 28, perspective: 400, zIndex: 3,
        }}
      >
        <div
          style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(145deg,#7C3AED,#5B21B6)",
            borderRadius: 5,
          }}
        />
        <div
          style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(145deg,#9333EA,#7C3AED)",
            borderRadius: 5,
            transformOrigin: "right center",
            animation: !reduce && h ? "wLeft 0.7s ease-out forwards" : undefined,
            transform: !reduce && h ? undefined : "rotateY(0deg)",
          }}
        />
      </div>
    </StatShell>
  );
}
