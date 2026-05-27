import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { CategoryIcon } from "@/components/CategoryIcon";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/categories")({ component: CategoriesPage });

type Cat = { id: string; name: string; icon: string; color: string };

function CategoriesPage() {
  const { family } = useAuth();
  const reduce = useReducedMotion();
  const [cats, setCats] = useState<Cat[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📦");
  const [color, setColor] = useState("#3ECF8E");

  const load = async () => {
    if (!family) return;
    const { data } = await supabase.from("categories").select("*").eq("family_id", family.id).order("name");
    setCats((data as Cat[]) ?? []);
    const { data: items } = await supabase.from("items").select("category_id").eq("family_id", family.id);
    const map: Record<string, number> = {};
    (items ?? []).forEach((i: { category_id: string | null }) => { if (i.category_id) map[i.category_id] = (map[i.category_id] || 0) + 1; });
    setCounts(map);
  };

  useEffect(() => { load(); }, [family]);

  const create = async () => {
    if (!family || !name.trim()) return;
    const { error } = await supabase.from("categories").insert({ family_id: family.id, name: name.trim(), icon, color });
    if (error) return toast.error(error.message);
    toast.success("Category added");
    setName(""); setIcon("📦"); setColor("#3ECF8E"); setOpen(false);
    load();
  };

  return (
    <div className="space-y-6">
      <BackButton label="Back" />
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Categories</h1>
          <p className="text-sm text-muted-foreground">Organize what you track.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" /> New category</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New category</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Toys" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Emoji</Label><Input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} /></div>
                <div className="space-y-2"><Label>Color</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></div>
              </div>
              <Button onClick={create} className="w-full">Add</Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {cats.map((c, i) => (
          <motion.div
            key={c.id}
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.3 }}
            whileHover={reduce ? undefined : "hover"}
          >
            <Link to="/category/$id" params={{ id: c.id }} className="card-glow group block rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <CategoryIcon name={c.name} color={c.color} size={32} />
                <motion.span
                  variants={{ hover: { y: -3 } }}
                  className="rounded-full bg-accent px-2 py-0.5 text-xs"
                >{counts[c.id] || 0} items</motion.span>
              </div>
              <p className="mt-3 font-semibold">{c.name}</p>
              <div className="mt-3 h-1 rounded-full" style={{ background: c.color, opacity: 0.6 }} />
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}