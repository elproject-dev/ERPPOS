import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

const toTitleCase = (str: string) =>
  str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

interface SearchableSelectProps {
  options: { id: string; name: string }[];
  value: string;
  onChange: (id: string, name: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  onCreate?: (name: string) => void;
  onDelete?: (id: string, name: string) => void;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Pilih...",
  disabled = false,
  loading = false,
  onCreate,
  onDelete,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedName = options.find((o) => o.id === value)?.name || "";

  const filtered = options.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    if (disabled || loading) return;
    setOpen(true);
    setSearch("");
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const handleSelect = (id: string, name: string) => {
    onChange(id, name);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled || loading}
        className={cn(
          "flex items-center justify-between w-full h-9 px-3 py-1 text-sm border border-input bg-transparent dark:bg-input/30 rounded-none shadow-xs",
          "text-left outline-none transition-[color,box-shadow]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          open && "border-ring ring-[3px] ring-ring/50"
        )}
      >
        <span className={cn(!selectedName && "text-muted-foreground/50")}>
          {loading ? "Loading..." : selectedName ? toTitleCase(selectedName) : placeholder}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 w-full mt-1 bg-popover border border-border shadow-md">
          <div className="p-1 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              className="w-full px-2 py-1.5 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
              placeholder="Cari..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-52 overflow-y-auto scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {filtered.length === 0 ? (
              <div className="py-3 text-center text-sm text-muted-foreground">
                {onCreate && search.trim() ? (
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onCreate(search.trim());
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    + Tambah "{search}"
                  </button>
                ) : (
                  "Tidak ditemukan"
                )}
              </div>
            ) : (
              filtered.map((o) => (
                <div key={o.id} className="group relative flex items-center">
                  <button
                    type="button"
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm transition-colors",
                      o.id === value
                        ? "bg-primary text-primary-foreground font-medium hover:bg-primary/90 hover:text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(o.id, o.name);
                    }}
                  >
                    {toTitleCase(o.name)}
                  </button>
                  {onDelete && o.id !== "none" && (
                    <button
                      type="button"
                      className="absolute right-2 p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded opacity-0 group-hover:opacity-100 transition-all"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDelete(o.id, o.name);
                      }}
                      title="Hapus permanen"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}

            {filtered.length > 0 && onCreate && search.trim() && !options.some(o => o.name.toLowerCase() === search.trim().toLowerCase()) && (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-accent font-medium border-t border-border mt-1"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onCreate(search.trim());
                  setOpen(false);
                  setSearch("");
                }}
              >
                + Tambah "{search}"
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
