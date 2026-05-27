import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { className, ...props },
  ref,
) {
  const [shown, setShown] = useState(false);
  const reduce = useReducedMotion();
  const Icon = shown ? EyeOff : Eye;
  return (
    <div className="relative">
      <Input
        ref={ref}
        {...props}
        type={shown ? "text" : "password"}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:text-primary"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={shown ? "off" : "on"}
            initial={reduce ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            className="grid place-items-center"
          >
            <Icon className="h-4 w-4" />
          </motion.span>
        </AnimatePresence>
      </button>
    </div>
  );
});
