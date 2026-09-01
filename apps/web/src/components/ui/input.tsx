import * as React from "react";
import { cn } from "../../lib/utils.js";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-9 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
      "placeholder:text-neutral-400 dark:border-neutral-700 dark:placeholder:text-neutral-500",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
