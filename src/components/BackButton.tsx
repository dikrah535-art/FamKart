import { useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

export function BackButton({ label = "Back" }: { label?: string }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={() => router.history.back()}
      whileHover={reduce ? undefined : { x: -4 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className="group inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-primary"
      aria-label={label}
    >
      <ChevronLeft className="h-4 w-4" />
      <span>{label}</span>
    </motion.button>
  );
}
