import React, { useState } from "react";
import { LucideIcon, TrendingDown, TrendingUp, Minus, Lock, Loader2 } from "lucide-react";
import { cn } from "../../utils/cn";

interface OnDemandMetricCardProps {
    title: string;
    value: string | null;
    costLabel: string;
    icon: LucideIcon;
    trend?: "up" | "down" | "neutral";
    status?: "nominal" | "warning" | "critical";
    className?: string;
    onFetch: () => Promise<void>;
}

export function OnDemandMetricCard({
    title,
    value,
    costLabel,
    icon: Icon,
    trend = "neutral",
    status = "nominal",
    className,
    onFetch,
}: OnDemandMetricCardProps) {
    const [isFetching, setIsFetching] = useState(false);

    const handleFetch = async () => {
        setIsFetching(true);
        try {
            await onFetch();
        } finally {
            setIsFetching(false);
        }
    };

    const statusColors = {
        nominal: "text-emerald-500 border-emerald-900/30 bg-emerald-950/10",
        warning: "text-yellow-500 border-yellow-900/30 bg-yellow-950/10",
        critical: "text-red-500 border-red-900/30 bg-red-950/10",
        locked: "text-zinc-500 border-zinc-800/50 bg-zinc-900/30",
    };

    const iconColors = {
        nominal: "text-emerald-500",
        warning: "text-yellow-500",
        critical: "text-red-500",
        locked: "text-zinc-500",
    };

    const currentStatus = value === null ? "locked" : status;

    return (
        <div
            className={cn(
                "flex flex-col justify-between rounded-xl border p-4 shadow-sm transition-colors",
                statusColors[currentStatus],
                className
            )}
        >
            <div className="flex items-center justify-between">
                <h3 className={cn("text-xs font-medium uppercase tracking-widest", value === null ? "text-zinc-500" : "text-zinc-400")}>
                    {title}
                </h3>
                <Icon className={cn("h-4 w-4", iconColors[currentStatus])} />
            </div>

            {value === null ? (
                <div className="mt-4 flex flex-col items-start justify-between gap-2">
                    <button
                        onClick={handleFetch}
                        disabled={isFetching}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-500 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                        {isFetching ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Lock className="h-4 w-4" />
                        )}
                        {isFetching ? "Fetching..." : `Fetch Data (${costLabel})`}
                    </button>
                    <span className="text-[10px] text-zinc-600 uppercase tracking-widest text-center w-full">
                        Paid AWS API
                    </span>
                </div>
            ) : (
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
            )}
        </div>
    );
}
