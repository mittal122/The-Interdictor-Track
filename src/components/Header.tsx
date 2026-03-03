import React, { useEffect, useState, useMemo } from "react";
import { Activity, AlertTriangle, CheckCircle2, Server, FlaskConical, Wifi, MapPin, LogOut } from "lucide-react";
import { cn } from "../utils/cn";
import { useAppMode } from "../contexts/AppModeContext";
import { useCredentials } from "../contexts/CredentialsContext";

export function Header({ telemetry }: { telemetry: any }) {
  const { mode, setMode, selectedRegion, setSelectedRegion } = useAppMode();
  const { clearCredentials } = useCredentials();
  const isCritical = telemetry?.globalHealth < 90;
  const hasAnomalies = (telemetry?.anomalies?.length ?? 0) > 0;
  const [time, setTime] = useState(new Date());

  const availableRegions = useMemo(() => {
    if (!telemetry) return [];
    const regions = new Set<string>();
    if (telemetry.computeNodes) {
      telemetry.computeNodes.forEach((n: any) => { if (n.region) regions.add(n.region); });
    }
    if (telemetry.storageArrays) {
      telemetry.storageArrays.forEach((a: any) => { if (a.region) regions.add(a.region); });
    }
    return Array.from(regions).sort();
  }, [telemetry]);

  // Tick the clock every second
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleToggle = () => setMode(mode === 'demo' ? 'live' : 'demo');

  const handleDisconnectAWS = () => {
    clearCredentials(); // Wipe transient + localStorage keys
    setMode('demo');
  };

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
            "relative flex items-center gap-0 rounded-full p-0.5 transition-all duration-300 cursor-pointer border",
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

      {/* Explicit AWS Disconnect Button (Live Mode Only) */}
      {mode === 'live' && (
        <button
          onClick={handleDisconnectAWS}
          title="Disconnect AWS Account"
          className="flex items-center justify-center p-1.5 rounded-full border border-red-900/40 bg-red-950/20 text-red-400 hover:bg-red-900/40 hover:text-red-300 transition-colors cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
        </button>
      )}

      {/* Region Selector (Live Mode Only) */}
      {mode === 'live' && (
        <div className="hidden lg:flex items-center gap-2 border-l border-zinc-800 pl-4">
          <MapPin className="h-3.5 w-3.5 text-zinc-500" />
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="bg-transparent border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 rounded px-2 py-1 outline-none transition-colors cursor-pointer"
          >
            <option value="global" className="bg-zinc-900">Global (All Regions)</option>
            {availableRegions.map(r => (
              <option key={r} value={r} className="bg-zinc-900 text-emerald-400">{r}</option>
            ))}
          </select>
        </div>
      )}

      {/* Clock */}
      <div className="hidden md:flex items-center gap-2 border-l border-zinc-800 pl-4">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">Time</span>
        <span className="text-xs font-medium text-zinc-300 font-mono">
          {time.toISOString().split('T')[1].split('.')[0]} UTC
        </span>
      </div>
    </div>
    </header >
  );
}
