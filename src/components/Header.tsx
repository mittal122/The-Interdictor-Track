import React, { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Server, FlaskConical, Wifi } from "lucide-react";
import { cn } from "../utils/cn";
import { useAppMode } from "../contexts/AppModeContext";

export function Header({ telemetry }: { telemetry: any }) {
  const { mode, setMode } = useAppMode();
  const isCritical = telemetry?.globalHealth < 90;
  const hasAnomalies = (telemetry?.anomalies?.length ?? 0) > 0;
  const [time, setTime] = useState(new Date());

  // Tick the clock every second
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleToggle = () => setMode(mode === 'demo' ? 'live' : 'demo');

  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 shrink-0">
      {/* Left: Logo */}
      <div className="flex items-center gap-3">
        <Server className="h-5 w-5 text-zinc-400" />
        <h1 className="text-sm font-bold tracking-widest text-zinc-100 uppercase">
          The Interdictor Track
        </h1>
        <span className="ml-2 rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium tracking-wider text-zinc-400">
          SYS.GOV.01
        </span>
      </div>

      {/* Right: status + mode toggle + time */}
      <div className="flex items-center gap-5">

        {/* Health Status */}
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-xs text-zinc-500 uppercase tracking-wider">Status</span>
          <div className="flex items-center gap-1.5">
            {isCritical ? (
              <AlertTriangle className="h-4 w-4 text-red-500" />
            ) : hasAnomalies ? (
              <Activity className="h-4 w-4 text-yellow-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
            <span className={cn(
              "text-xs font-medium uppercase tracking-wider",
              isCritical ? "text-red-500" : hasAnomalies ? "text-yellow-500" : "text-emerald-500"
            )}>
              {isCritical ? "Critical" : hasAnomalies ? "Warning" : "Nominal"}
            </span>
          </div>
        </div>

        {/* Demo / Live Mode Toggle */}
        <button
          onClick={handleToggle}
          title={mode === 'demo' ? "Switch to Live Mode (connects to real backend)" : "Switch to Demo Mode (simulated data)"}
          className={cn(
            "relative flex items-center gap-0 rounded-full p-0.5 transition-all duration-300 cursor-pointer",
            "border",
            mode === 'live'
              ? "border-emerald-700/60 bg-emerald-950/50"
              : "border-yellow-700/60 bg-yellow-950/40"
          )}
        >
          {/* DEMO pill */}
          <span className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition-all duration-300",
            mode === 'demo'
              ? "bg-yellow-500/20 text-yellow-300"
              : "text-zinc-500"
          )}>
            <FlaskConical className="h-3 w-3" />
            Demo
          </span>

          {/* LIVE pill */}
          <span className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition-all duration-300",
            mode === 'live'
              ? "bg-emerald-500/20 text-emerald-300"
              : "text-zinc-500"
          )}>
            <Wifi className="h-3 w-3" />
            Live
          </span>
        </button>

        {/* Clock */}
        <div className="hidden md:flex items-center gap-2">
          <span className="text-xs text-zinc-500 uppercase tracking-wider">Time</span>
          <span className="text-xs font-medium text-zinc-300 font-mono">
            {time.toISOString().split('T')[1].split('.')[0]} UTC
          </span>
        </div>
      </div>
    </header>
  );
}
