import * as React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "./icons.js";
import { cn } from "../../lib/utils.js";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;

export function DialogContent({
  className,
  children,
  closeLabel,
  ...props
}: React.ComponentPropsWithoutRef<typeof RadixDialog.Content> & { closeLabel: string }): React.JSX.Element {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in" />
      <RadixDialog.Content
        className={cn(
          "fixed start-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg",
          "border border-neutral-200 bg-white p-6 shadow-lg dark:border-neutral-800 dark:bg-neutral-900",
          "rtl:translate-x-1/2",
          className,
        )}
        {...props}
      >
        {children}
        <RadixDialog.Close
          className="absolute end-4 top-4 rounded-md p-1 text-neutral-500 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:hover:bg-neutral-800"
          aria-label={closeLabel}
        >
          <X />
        </RadixDialog.Close>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

/**
 * UX.md §5 level 3 calls this a "מגירה" (drawer), not a dialog — same
 * Radix root (focus trap, Escape-to-close, portal) as `DialogContent`,
 * but anchored to the inline-end edge and full height instead of centered,
 * so the board (and its status) stays visible behind the overlay rather
 * than being replaced by a centered modal.
 */
export function DrawerContent({
  className,
  children,
  closeLabel,
  ...props
}: React.ComponentPropsWithoutRef<typeof RadixDialog.Content> & { closeLabel: string }): React.JSX.Element {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <RadixDialog.Content
        className={cn(
          "fixed inset-y-0 end-0 z-50 flex w-full max-w-md flex-col border-neutral-200 bg-white shadow-lg [border-inline-start-width:1px] dark:border-neutral-800 dark:bg-neutral-900",
          className,
        )}
        {...props}
      >
        {children}
        <RadixDialog.Close
          className="absolute end-4 top-4 rounded-md p-1 text-neutral-500 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:hover:bg-neutral-800"
          aria-label={closeLabel}
        >
          <X />
        </RadixDialog.Close>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={cn("mb-4 flex flex-col gap-1", className)} {...props} />;
}

export const DialogTitle = RadixDialog.Title;
export const DialogDescription = RadixDialog.Description;
