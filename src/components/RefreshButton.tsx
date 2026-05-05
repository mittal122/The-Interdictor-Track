import React, { useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";

interface RefreshButtonProps {
  onRefresh: () => Promise<void> | void;
  label?: string;
  className?: string;
}

/**
 * Reusable per-page refresh button with spin animation and cooldown.
 * Prevents rapid re-clicks with a 1s cooldown after each refresh.
 */
export function RefreshButton({ onRefresh, label = "Refresh", className = "" }: RefreshButtonProps) {
  const [spinning, setSpinning] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);

  const handleClick = useCallback(async () => {
    if (spinning) return;
    setSpinning(true);
    try {
      await onRefresh();
    } catch (e) {
      console.error("[RefreshButton] refresh error:", e);
    } finally {
      setLastRefresh(Date.now());
      // Keep spin for at least 600ms so user sees feedback
      setTimeout(() => setSpinning(false), 600);
    }
  }, [onRefresh, spinning]);

  const timeSince = lastRefresh ? Math.round((Date.now() - lastRefresh) / 1000) : null;

  return (
    <button
      onClick={handleClick}
      disabled={spinning}
      title={timeSince !== null ? `Last refreshed ${timeSince}s ago` : "Refresh data"}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider
        border transition-all duration-200
        ${spinning
          ? "border-violet-500/40 bg-violet-500/10 text-violet-300 cursor-wait"
          : "border-zinc-700/50 bg-zinc-800/40 text-zinc-400 hover:text-zinc-200 hover:border-violet-500/30 hover:bg-violet-500/5 active:scale-95"
        }
        ${className}
      `}
    >
      <RefreshCw className={`h-3 w-3 ${spinning ? "animate-spin" : ""}`} />
      {spinning ? "Refreshing…" : label}
    </button>
  );
}
