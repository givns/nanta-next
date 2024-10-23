import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Dialog = ({
  children,
  open,
  onOpenChange,
  className,
}: {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) => {
  const [isOpen, setIsOpen] = useState(open);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsOpen(open);
  }, [open]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange?.(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onOpenChange]);

  if (!isOpen) return null;

  const handleOverlayClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onOpenChange?.(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      onOpenChange?.(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      ref={dialogRef}
    >
      <button
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleOverlayClick}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        aria-hidden="true"
      />
      <div
        className={cn(
          'relative bg-white z-50 rounded-lg shadow-lg w-full max-w-lg max-h-[85vh] overflow-auto',
          className,
        )}
        role="document"
      >
        {children}
      </div>
    </div>
  );
};

const DialogContent = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={cn('grid gap-4 p-6', className)} role="document">
      {children}
    </div>
  );
};

const DialogHeader = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        'flex flex-col space-y-1.5 text-center sm:text-left p-6 pb-0',
        className,
      )}
    >
      {children}
    </div>
  );
};

const DialogTitle = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <h2
      className={cn(
        'text-lg font-semibold leading-none tracking-tight',
        className,
      )}
      id="dialog-title"
    >
      {children}
    </h2>
  );
};

const DialogFooter = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-0',
        className,
      )}
    >
      {children}
    </div>
  );
};

const DialogClose = ({
  onClick,
  className,
}: {
  onClick?: () => void;
  className?: string;
}) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        'absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground',
        className,
      )}
      aria-label="Close dialog"
    >
      <X className="h-4 w-4" />
    </button>
  );
};

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
};
