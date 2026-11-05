"use client";
import { Loader2, type LucideIcon } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn, ICON_STROKE } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-accent to-accent-2 text-accent-fg shadow-soft hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100",
  secondary: "bg-surface-2 text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-3 disabled:opacity-50",
  ghost: "text-accent-text hover:bg-accent-soft disabled:opacity-50",
  danger: "bg-danger-soft text-danger-text hover:brightness-110 disabled:opacity-50",
};

/** Toutes les tailles gardent une cible tactile d'au moins 44 px. */
const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-11 gap-1.5 px-3 text-body-sm",
  md: "min-h-11 gap-2 px-4 text-body",
  lg: "min-h-13 gap-2 px-5 text-body font-semibold",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon: Icon, iconRight: IconRight, loading, fullWidth, className, children, disabled, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "focus-ring inline-flex select-none items-center justify-center rounded-field font-medium",
        "transition-[transform,filter,background-color,box-shadow] duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 aria-hidden className="size-[18px] animate-spin" strokeWidth={ICON_STROKE} />
      ) : (
        Icon && <Icon aria-hidden className="size-[18px] shrink-0" strokeWidth={ICON_STROKE} />
      )}
      {children}
      {IconRight && !loading && <IconRight aria-hidden className="size-[18px] shrink-0" strokeWidth={ICON_STROKE} />}
    </button>
  );
});

/** Bouton rond ne contenant qu'une icône (le libellé est obligatoire pour les lecteurs d'écran). */
export const IconButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "icon" | "children"> & { icon: LucideIcon; label: string }>(
  function IconButton({ icon: Icon, label, variant = "ghost", className, ...rest }, ref) {
    return (
      <Button ref={ref} variant={variant} aria-label={label} title={label} className={cn("size-11 rounded-full px-0", className)} {...rest}>
        <Icon aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
      </Button>
    );
  },
);
