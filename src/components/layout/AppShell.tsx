import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Home, LayoutGrid, History, Wallet, Settings, LogOut, Menu, X, Copy,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/categories", label: "Categories", icon: LayoutGrid },
  { to: "/history", label: "History", icon: History },
  { to: "/budget", label: "Budget", icon: Wallet },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, family, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const initials = (profile?.full_name || "U")
    .split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-sidebar/60 backdrop-blur-xl">
        <SidebarInner pathname={pathname} family={family} initials={initials} name={profile?.full_name} onLogout={async () => { await signOut(); navigate({ to: "/" }); }} />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary">
            <Home className="h-4 w-4" />
          </div>
          <span className="font-bold">NestList</span>
        </div>
        <Button size="icon" variant="ghost" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></Button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-md" onClick={() => setOpen(false)} />
          <motion.aside
            initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
            className="relative flex h-full w-72 flex-col border-r border-border bg-sidebar"
          >
            <div className="flex justify-end p-2">
              <Button size="icon" variant="ghost" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button>
            </div>
            <SidebarInner
              pathname={pathname} family={family} initials={initials} name={profile?.full_name}
              onLogout={async () => { await signOut(); navigate({ to: "/" }); }}
              onNavigate={() => setOpen(false)}
            />
          </motion.aside>
        </motion.div>
      )}

      <main className="flex-1 min-w-0 pt-16 md:pt-0">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mx-auto max-w-7xl p-4 md:p-8"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}

function SidebarInner({
  pathname, family, initials, name, onLogout, onNavigate,
}: {
  pathname: string;
  family: { name: string; invite_code: string } | null;
  initials: string;
  name?: string | null;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="hidden md:flex items-center gap-2 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
          <Home className="h-5 w-5" />
        </div>
        <span className="text-lg font-bold tracking-tight">NestList</span>
        <span className="ml-1 h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_currentColor]" />
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {nav.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ${
                active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
            >
              <span className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-primary transition-all ${active ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`} />
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        {family && (
          <div className="mb-3 rounded-lg border border-border bg-card/60 p-3">
            <p className="text-xs text-muted-foreground">Family</p>
            <p className="truncate text-sm font-semibold">{family.name}</p>
            <button
              onClick={() => { navigator.clipboard.writeText(family.invite_code); toast.success("Invite code copied"); }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-mono text-primary hover:bg-primary/20"
            >
              <Copy className="h-3 w-3" /> {family.invite_code}
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-secondary/20 text-sm font-semibold text-secondary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name ?? "You"}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={onLogout} title="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}