import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";
import { ItemFormDrawer } from "./ItemFormDrawer";

export function QuickAddFab() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(true)}
        className="pulse-glow fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg"
        aria-label="Quick add (N)"
      >
        <Plus className="h-6 w-6" />
      </motion.button>
      <ItemFormDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}