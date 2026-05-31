import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { FocusEvent, MouseEvent } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Reliable "select all on focus" for inputs (esp. type="number").
// Plain onFocus={e.target.select()} fails because the mouseup right after
// focus clears the selection. Re-select on the next frame and on click.
export const selectOnFocus = {
  onFocus: (e: FocusEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    requestAnimationFrame(() => {
      try { el.select(); } catch {}
    });
  },
  onClick: (e: MouseEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    if (el.selectionStart === el.selectionEnd) {
      try { el.select(); } catch {}
    }
  },
};
