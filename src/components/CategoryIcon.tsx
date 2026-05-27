import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  ShoppingCart, Brush, UtensilsCrossed, Pill, Package, BookOpen,
  Droplets, Shirt, Wrench, PawPrint, type LucideIcon,
} from "lucide-react";

type Spec = {
  Icon: LucideIcon;
  variants: Variants;
  duration: number;
  origin?: string;
};

const MAP: Record<string, Spec> = {
  groceries:           { Icon: ShoppingCart,    variants: { hover: { x: [-4, 4, -4] } },        duration: 0.5 },
  "cleaning supplies": { Icon: Brush,           variants: { hover: { rotate: [-15, 15, -15] } }, duration: 0.6 },
  "kitchen essentials":{ Icon: UtensilsCrossed, variants: { hover: { rotate: [-10, 10, -10] } }, duration: 0.7 },
  medicines:           { Icon: Pill,            variants: { hover: { scale: [1, 0.85, 1] } },    duration: 0.8 },
  miscellaneous:       { Icon: Package,         variants: { hover: { y: [0, -6, 0] } },          duration: 1.0 },
  stationery:          { Icon: BookOpen,        variants: { hover: { rotate: [-5, 5, -5] } },    duration: 0.6 },
  "personal care":     { Icon: Droplets,        variants: { hover: { scaleY: [1, 0.88, 1] } },   duration: 0.8 },
  clothing:            { Icon: Shirt,           variants: { hover: { rotate: [-8, 8, -8] } },    duration: 1.0, origin: "top center" },
  "hardware & tools":  { Icon: Wrench,          variants: { hover: { rotate: [0, -45, 0] } },    duration: 0.6 },
  "pet supplies":      { Icon: PawPrint,        variants: { hover: { y: [0, -6, 0], scale: [1, 1.1, 1] } }, duration: 0.5 },
};

export function getCategorySpec(name: string): Spec {
  return MAP[name.trim().toLowerCase()] ?? {
    Icon: Package,
    variants: { hover: { y: [0, -4, 0] } },
    duration: 0.8,
  };
}

export function CategoryIcon({
  name,
  color,
  size = 28,
  className,
}: {
  name: string;
  color?: string;
  size?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const spec = getCategorySpec(name);
  const { Icon } = spec;
  return (
    <motion.div
      variants={reduce ? undefined : spec.variants}
      transition={{ duration: spec.duration, repeat: Infinity, ease: "easeInOut" }}
      style={{ transformOrigin: spec.origin, display: "inline-flex", color }}
      className={className}
    >
      <Icon size={size} strokeWidth={2} />
    </motion.div>
  );
}
