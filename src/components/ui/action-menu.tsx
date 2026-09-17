import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActionMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  className?: string;
  destructive?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  align?: "start" | "end";
  triggerClassName?: string;
}

export function ActionMenu({ items, align = "end", triggerClassName }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
    setPosition(null);
  }, []);

  // Calculate position when menu opens
  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 160; // min-w-[10rem] = 160px

    let top = rect.bottom + 4; // 4px gap below the trigger
    let left = align === "end" ? rect.right - menuWidth : rect.left;

    // Ensure menu doesn't go off-screen horizontally
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }

    // If menu would go below viewport, show above the trigger
    const estimatedMenuHeight = items.length * 36 + 8; // rough estimate
    if (top + estimatedMenuHeight > window.innerHeight - 8) {
      top = rect.top - estimatedMenuHeight - 4;
    }

    setPosition({ top, left });
  }, [open, align, items.length]);

  // Close on outside click & escape
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        handleClose();
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleClose();
      }
    }

    function handleScroll() {
      handleClose();
    }

    // Small delay to avoid capturing the click that opened the menu
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
      window.addEventListener("scroll", handleScroll, true);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, handleClose]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen((prev) => !prev);
  };

  const handleItemClick = (e: React.MouseEvent, item: ActionMenuItem) => {
    e.stopPropagation();
    e.preventDefault();
    handleClose();
    // Small delay to let menu close before executing action
    setTimeout(() => {
      item.onClick();
    }, 10);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={cn(
          "inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          triggerClassName
        )}
      >
        <span className="sr-only">Buka menu</span>
        <MoreVertical className="h-4 w-4 text-slate-500" />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] min-w-[10rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
            style={{ top: position.top, left: position.left }}
          >
            {items.map((item, index) => (
              <button
                key={index}
                type="button"
                className={cn(
                  "group relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground [&_svg]:hover:text-accent-foreground",
                  item.destructive && "text-red-600 hover:text-white hover:bg-red-600 [&_svg]:hover:text-white",
                  item.className
                )}
                onClick={(e) => handleItemClick(e, item)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
