import { Activity, AlertTriangle, CheckCircle2, Server } from "lucide-react";
import { cn } from "../utils/cn";

export function Header({ telemetry }: { telemetry: any }) {
  const isCritical = telemetry?.globalHealth < 90;
  const hasAnomalies = telemetry?.activeAnomalies > 0;

  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 shrink-0">
      <div className="flex items-center gap-3">
        <Server className="h-5 w-5 text-zinc-400" />
        <h1 className="text-sm font-bold tracking-widest text-zinc-100 uppercase">
          The Interdictor Track
        </h1>
        <span className="ml-2 rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium tracking-wider text-zinc-400">
          SYS.GOV.01
        </span>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 uppercase tracking-wider">Status</span>
          <div className="flex items-center gap-1.5">
            {isCritical ? (
              <AlertTriangle className="h-4 w-4 text-red-500" />
            ) : hasAnomalies ? (
              <Activity className="h-4 w-4 text-yellow-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
            <span
              className={cn(
                "text-xs font-medium uppercase tracking-wider",
                isCritical
                  ? "text-red-500"
                  : hasAnomalies
                  ? "text-yellow-500"
                  : "text-emerald-500"
              )}
            >
              {isCritical ? "Critical" : hasAnomalies ? "Warning" : "Nominal"}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 uppercase tracking-wider">Time</span>
          <span className="text-xs font-medium text-zinc-300">
            {new Date().toISOString().split('T')[1].split('.')[0]} UTC
          </span>
        </div>
      </div>
    </header>
  );
}
