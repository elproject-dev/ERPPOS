import { cn } from "@/lib/utils";

export function LoadingSpinner({ text = "Memuat data...", className }: { text?: string; className?: string }) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center min-h-[400px] h-full w-full", className)}>
      <div className="relative flex items-center justify-center mb-6">
        <div className="absolute w-16 h-16 border-4 border-primary/30 dark:border-primary/20 border-t-primary border-b-primary rounded-full animate-spin"></div>
        <div className="absolute w-12 h-12 border-4 border-primary/20 dark:border-primary/10 border-l-primary/80 border-r-primary/80 rounded-full animate-[spin_1.5s_linear_infinite_reverse]"></div>
        <div className="w-6 h-6 bg-primary rounded-full animate-pulse shadow-[0_0_15px_hsl(var(--primary))]"></div>
      </div>
      <p className="text-primary/80 font-medium tracking-wide animate-pulse">{text}</p>
    </div>
  )
}
