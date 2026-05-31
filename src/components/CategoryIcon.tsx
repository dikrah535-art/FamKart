import { motion, useReducedMotion, type Variants } from "framer-motion";

type Spec = {
  emoji: string;
  variants: Variants;
  duration: number;
  origin?: string;
};

const MAP: Record<string, Spec> = {
  groceries:                 { emoji: "🛒",  variants: { hover: { x: [-4, 4, -4] } },        duration: 0.5 },
  "personal care":           { emoji: "🧴",  variants: { hover: { scaleY: [1, 0.88, 1] } },   duration: 0.8 },
  "cleaning supplies":       { emoji: "🧹",  variants: { hover: { rotate: [-15, 15, -15] } }, duration: 0.6 },
  stationery:                { emoji: "📚",  variants: { hover: { rotate: [-5, 5, -5] } },    duration: 0.6 },
  medicines:                 { emoji: "💊",  variants: { hover: { scale: [1, 0.85, 1] } },    duration: 0.8 },
  "kitchen essentials":      { emoji: "🍳",  variants: { hover: { rotate: [-10, 10, -10] } }, duration: 0.7 },
  clothing:                  { emoji: "👗",  variants: { hover: { rotate: [-8, 8, -8] } },    duration: 1.0, origin: "top center" },
  "hardware & tools":        { emoji: "🔧",  variants: { hover: { rotate: [0, -45, 0] } },    duration: 0.6 },
  "pet supplies":            { emoji: "🐾",  variants: { hover: { y: [0, -6, 0], scale: [1, 1.1, 1] } }, duration: 0.5 },
  miscellaneous:             { emoji: "📦",  variants: { hover: { y: [0, -6, 0] } },          duration: 1.0 },
  "dineout & food delivery": { emoji: "🍽️", variants: { hover: { y: [0, -4, 0] } },          duration: 0.7 },
  "fuel & transport":        { emoji: "⛽",  variants: { hover: { x: [-3, 3, -3] } },         duration: 0.6 },
  utilities:                 { emoji: "⚡",  variants: { hover: { scale: [1, 1.15, 1] } },    duration: 0.5 },
  "emi & bills":             { emoji: "💳",  variants: { hover: { rotate: [-6, 6, -6] } },    duration: 0.7 },
};

export function getCategorySpec(name: string): Spec {
  return MAP[name.trim().toLowerCase()] ?? {
    emoji: "📦",
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
  return (
    <motion.span
      role="img"
      aria-label={name}
      variants={reduce ? undefined : spec.variants}
      transition={{ duration: spec.duration, repeat: Infinity, ease: "easeInOut" }}
      style={{
        transformOrigin: spec.origin,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "2rem",
        lineHeight: 1,
        color,
      }}
      className={className}
    >
      {spec.emoji}
    </motion.span>
  );
}
