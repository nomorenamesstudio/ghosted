import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow",
        outline: "text-foreground",
        // -200 fills: the cards carry a -100 status tint, so a -100 badge
        // disappeared into its own card.
        success:
          "border-transparent bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100",
        warning:
          "border-transparent bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
        info: "border-transparent bg-sky-200 text-sky-900 dark:bg-sky-900 dark:text-sky-100",
        violet:
          "border-transparent bg-violet-200 text-violet-900 dark:bg-violet-900 dark:text-violet-100",
        danger:
          "border-transparent bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100",
        muted:
          "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
