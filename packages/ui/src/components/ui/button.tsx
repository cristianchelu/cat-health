import * as React from "react"
import { cn } from "@/lib/utils"
import "./button.css"

interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", icon = false, children, ...props }, ref) => {
    return (
      <button
        className={cn(
          "button",
          variant && `button-${variant}`,
          size && `button-${size}`,
          icon && "button-icon",
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = "Button"

export { Button, type ButtonProps }
