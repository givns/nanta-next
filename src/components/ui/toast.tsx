// components/ui/toast.tsx

import * as React from 'react';
// Define possible variants for the toast
type ToastVariant = 'default' | 'success' | 'destructive' | 'warning';
// Define the type for an action element in the toast, such as a button for undo, retry, etc.
export type ToastActionElement = React.ReactElement<
  React.ButtonHTMLAttributes<HTMLButtonElement> | HTMLAnchorElement
>;

// Toast properties defining the toast message structure
export interface ToastProps {
  id: string;
  title: React.ReactNode; // The title of the toast
  description?: React.ReactNode; // Additional description for context
  action?: ToastActionElement; // Optional action element for user interaction
  open?: boolean; // State to control visibility
  onOpenChange?: (open: boolean) => void; // Callback to handle open state changes
  duration?: number; // Duration in milliseconds before the toast disappears
  variant?: ToastVariant; // Variant to control the toast style (e.g., success, destructive)
}

// Define the actual Toast component that receives ToastProps
export const Toast: React.FC<ToastProps> = ({
  title,
  description,
  action,
  open = true,
  onOpenChange,
  duration = 5000,
  variant = 'default',
}) => {
  // Auto-dismiss functionality based on the provided duration
  React.useEffect(() => {
    if (!open || duration === Infinity) return;

    const timeout = setTimeout(() => {
      if (onOpenChange) onOpenChange(false);
    }, duration);

    return () => clearTimeout(timeout);
  }, [open, duration, onOpenChange]);

  return open ? (
    <div className={`toast-container toast-${variant}`}>
      <div className="toast-content">
        <div className="toast-header">
          <strong>{title}</strong>
          {action}
        </div>
        {description && <p>{description}</p>}
      </div>
    </div>
  ) : null;
};
