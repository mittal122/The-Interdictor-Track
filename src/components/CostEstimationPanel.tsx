import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { DollarSign, TrendingDown, AlertTriangle, Loader2, X, BarChart3 } from 'lucide-react';
import { cn } from '../utils/cn';
import { useSocket } from '../contexts/SocketContext';

interface CostEstimation {
    totalMonthly: number;
    byService: { service: string; cost: number; count: number }[];
    byRegion: { region: string; cost: number; count: number }[];
    byResource: { id: string; name: string; type: string; region: string; monthlyEstimate: number; details: string; isWasted: boolean; wasteReason?: string }[];
    topDrivers: { id: string; name: string; type: string; monthlyEstimate: number; details: string }[];
    wastedCost: number;
    wastedResources: { name: string; type: string; monthlyEstimate: number; wasteReason?: string }[];
    currency: string;
    disclaimer: string;
}

const CHART_COLORS = ['#0ea5e9', '#f97316', '#22c55e', '#a855f7', '#ef4444', '#eab308', '#ec4899', '#14b8a6', '#6366f1', '#f43f5e'];

const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
            <div className="text-zinc-300 font-semibold">{payload[0].name || payload[0].payload?.service || payload[0].payload?.name}</div>
            <div className="text-emerald-400 font-mono">${payload[0].value?.toFixed(2)}/mo</div>
        </div>
    );
};

export function CostEstimationPanel({ infraData, onClose }: { infraData: any; onClose: () => void }) {
    const { socket } = useSocket();
    const [costs, setCosts] = useState<CostEstimation | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!socket || !infraData) return;
        setLoading(true);
        socket.emit('estimate_costs', { infraData }, (res: any) => {
            setLoading(false);
            if (res.status === 'success') setCosts(res.data);
        });
    }, [socket, infraData]);

    if (loading) {
        return (
            <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/50 p-6 flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
                    <div className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Estimating costs…</div>
                </div>
            </div>
        );
    }

    if (!costs) return null;

    return (
        <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/20 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50">
                <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-300">Cost Estimation</span>
                </div>
                <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 transition"><X className="h-3.5 w-3.5 text-zinc-500" /></button>
            </div>

            <div className="p-4 space-y-4">
                {/* Key Metrics */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-center">
                        <div className="text-2xl font-mono font-bold text-emerald-400">${costs.totalMonthly.toFixed(2)}</div>
                        <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1">Est. Monthly</div>
                    </div>
                    <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 px-4 py-3 text-center">
                        <div className="text-2xl font-mono font-bold text-sky-400">${(costs.totalMonthly * 12).toFixed(0)}</div>
                        <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1">Est. Annual</div>
                    </div>
                    <div className={cn("rounded-lg border px-4 py-3 text-center",
                        costs.wastedCost > 0 ? "border-red-500/20 bg-red-500/5" : "border-zinc-800/50 bg-zinc-900/30"
                    )}>
                        <div className={cn("text-2xl font-mono font-bold", costs.wastedCost > 0 ? "text-red-400" : "text-zinc-500")}>
                            ${costs.wastedCost.toFixed(2)}
                        </div>
                        <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1">Wasted Spend</div>
                    </div>
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Service Breakdown Pie */}
                    <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-3 min-w-0">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 flex items-center gap-1.5">
                            <BarChart3 className="h-3 w-3" /> By Service
                        </h4>
                        <div className="h-[160px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={costs.byService} dataKey="cost" nameKey="service" cx="50%" cy="50%"
                                        outerRadius={55} innerRadius={30} paddingAngle={2} strokeWidth={0}>
                                        {costs.byService.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend formatter={(v: string) => <span className="text-[9px] text-zinc-400">{v}</span>} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Top Cost Drivers Bar */}
                    <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-3 min-w-0">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 flex items-center gap-1.5">
                            <TrendingDown className="h-3 w-3" /> Top Cost Drivers
                        </h4>
                        <div className="h-[160px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={costs.topDrivers.slice(0, 5)} layout="vertical"
                                    margin={{ left: 60, right: 10, top: 5, bottom: 5 }}>
                                    <XAxis type="number" tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={(v: number) => `$${v}`} />
                                    <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 9 }} width={55} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="monthlyEstimate" radius={[0, 4, 4, 0]}>
                                        {costs.topDrivers.slice(0, 5).map((_, i) => <Cell key={i} fill={CHART_COLORS[i]} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Wasted Resources */}
                {costs.wastedResources.length > 0 && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-2 flex items-center gap-1.5">
                            <AlertTriangle className="h-3 w-3" /> Wasted Resources ({costs.wastedResources.length})
                        </h4>
                        <div className="space-y-1">
                            {costs.wastedResources.map((r, i) => (
                                <div key={i} className="flex items-center justify-between text-[11px] py-1.5 px-2 rounded bg-zinc-900/50">
                                    <div className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                        <span className="text-zinc-300 font-medium">{r.name}</span>
                                        <span className="text-[9px] text-zinc-600 uppercase">{r.type}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[9px] text-zinc-500">{r.wasteReason}</span>
                                        <span className="text-red-400 font-mono font-bold">${r.monthlyEstimate.toFixed(2)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Disclaimer */}
                <div className="text-[9px] text-zinc-600 text-center">{costs.disclaimer}</div>
            </div>
        </div>
    );
}
