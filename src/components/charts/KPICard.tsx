import { LucideIcon, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "../../utils/cn";

interface KPICardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  trend: "up" | "down" | "neutral";
  status: "nominal" | "warning" | "critical";
  className?: string;
}

export function KPICard({ title, value, icon: Icon, trend, status, className }: KPICardProps) {
  const statusColors = {
    nominal: "text-emerald-500 border-emerald-900/30 bg-emerald-950/10",
    warning: "text-yellow-500 border-yellow-900/30 bg-yellow-950/10",
    critical: "text-red-500 border-red-900/30 bg-red-950/10",
  };

  const iconColors = {
    nominal: "text-emerald-500",
    warning: "text-yellow-500",
    critical: "text-red-500",
  };

  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4 shadow-sm transition-colors",
        statusColors[status],
        className
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-400">
          {title}
        </h3>
        <Icon className={cn("h-4 w-4", iconColors[status])} />
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div className="text-2xl font-bold tracking-tight text-zinc-100 font-mono">
          {value}
        </div>
        <div className="flex items-center gap-1 text-xs font-medium text-zinc-500">
          {trend === "up" && <TrendingUp className="h-3 w-3" />}
          {trend === "down" && <TrendingDown className="h-3 w-3" />}
          {trend === "neutral" && <Minus className="h-3 w-3" />}
          <span className="uppercase tracking-wider">
            {trend === "up" ? "Inc" : trend === "down" ? "Dec" : "Stb"}
          </span>
        </div>
      </div>
    </div>
  );
}
