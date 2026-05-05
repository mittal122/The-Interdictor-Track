import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import {
    DollarSign, Network, ChevronDown, ChevronRight, Loader2, X,
    AlertTriangle, Globe, Layers, Server
} from 'lucide-react';
import { cn } from '../utils/cn';
import { useSocket } from '../contexts/SocketContext';

interface VpcCostGroup {
    vpcId: string;
    vpcName: string;
    region: string;
    totalMonthly: number;
    wastedCost: number;
    resourceCount: number;
    byService: { service: string; cost: number; count: number }[];
    resources: { id: string; name: string; type: string; region: string; monthlyEstimate: number; details: string; isWasted: boolean; wasteReason?: string }[];
    wastedResources: { name: string; type: string; monthlyEstimate: number; wasteReason?: string }[];
}

interface VpcCostEstimation {
    vpcGroups: VpcCostGroup[];
    unattachedResources: VpcCostGroup;
    grandTotalMonthly: number;
    grandWastedCost: number;
    currency: string;
    disclaimer: string;
}

const VPC_COLORS = [
    '#0ea5e9', '#a855f7', '#f97316', '#22c55e', '#ef4444',
    '#eab308', '#ec4899', '#14b8a6', '#6366f1', '#f43f5e',
];

const SERVICE_COLORS: Record<string, string> = {
    EC2: '#f97316', RDS: '#a855f7', EBS: '#6366f1', S3: '#22c55e',
    LAMBDA: '#eab308', ELB: '#0ea5e9', NAT: '#ef4444', EIP: '#ec4899',
};

const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
            <div className="text-zinc-300 font-semibold">{payload[0].name || payload[0].payload?.service || payload[0].payload?.vpcName}</div>
            <div className="text-emerald-400 font-mono">${payload[0].value?.toFixed(2)}/mo</div>
        </div>
    );
};

function VpcCard({ group, index, isExpanded, onToggle }: { group: VpcCostGroup; index: number; isExpanded: boolean; onToggle: () => void }) {
    const color = VPC_COLORS[index % VPC_COLORS.length];
    const isUnattached = group.vpcId === 'unattached';
    const costPercent = group.totalMonthly > 0 ? 100 : 0;

    return (
        <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 overflow-hidden transition-all">
            {/* VPC Header */}
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/30 transition-colors group"
            >
                <div className="flex items-center justify-center h-8 w-8 rounded-lg shrink-0"
                    style={{ backgroundColor: `${color}15`, border: `1px solid ${color}40` }}
                >
                    {isUnattached
                        ? <Globe className="h-4 w-4" style={{ color }} />
                        : <Network className="h-4 w-4" style={{ color }} />
                    }
                </div>

                <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-200 truncate">{group.vpcName}</span>
                        <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider shrink-0">{group.region}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[9px] text-zinc-500">{group.resourceCount} resources</span>
                        <span className="text-[9px] text-zinc-600">•</span>
                        <span className="text-[9px] text-zinc-500">{group.byService.length} service types</span>
                        {group.wastedCost > 0 && (
                            <>
                                <span className="text-[9px] text-zinc-600">•</span>
                                <span className="text-[9px] text-red-400 flex items-center gap-0.5">
                                    <AlertTriangle className="h-2.5 w-2.5" /> ${group.wastedCost.toFixed(2)} wasted
                                </span>
                            </>
                        )}
                    </div>
                </div>

                <div className="text-right shrink-0">
                    <div className="text-lg font-mono font-bold" style={{ color }}>
                        ${group.totalMonthly.toFixed(2)}
                    </div>
                    <div className="text-[9px] text-zinc-600 uppercase tracking-wider">/month</div>
                </div>

                <div className="text-zinc-600 group-hover:text-zinc-400 transition shrink-0 ml-1">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
            </button>

            {/* Expanded Detail */}
            {isExpanded && (
                <div className="border-t border-zinc-800/40 px-4 py-4 space-y-4 bg-zinc-950/30">
                    {/* Service Breakdown */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Mini Pie Chart */}
                        <div className="rounded-lg border border-zinc-800/40 bg-zinc-900/30 p-3">
                            <h5 className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Service Breakdown</h5>
                            {group.byService.length > 0 ? (
                                <div className="h-[120px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={group.byService}
                                                dataKey="cost"
                                                nameKey="service"
                                                cx="50%"
                                                cy="50%"
                                                outerRadius={45}
                                                innerRadius={25}
                                                paddingAngle={2}
                                                strokeWidth={0}
                                            >
                                                {group.byService.map((entry, i) => (
                                                    <Cell key={i} fill={SERVICE_COLORS[entry.service] || VPC_COLORS[i % VPC_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip content={<CustomTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div className="h-[120px] flex items-center justify-center text-zinc-600 text-xs">No cost data</div>
                            )}
                        </div>

                        {/* Service List */}
                        <div className="rounded-lg border border-zinc-800/40 bg-zinc-900/30 p-3">
                            <h5 className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Cost by Service</h5>
                            <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                                {group.byService.map((svc, i) => (
                                    <div key={svc.service} className="flex items-center justify-between text-[11px]">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full shrink-0"
                                                style={{ backgroundColor: SERVICE_COLORS[svc.service] || VPC_COLORS[i % VPC_COLORS.length] }}
                                            />
                                            <span className="text-zinc-300 font-medium">{svc.service}</span>
                                            <span className="text-[9px] text-zinc-600">×{svc.count}</span>
                                        </div>
                                        <span className="text-zinc-200 font-mono font-semibold">${svc.cost.toFixed(2)}</span>
                                    </div>
                                ))}
                                {group.byService.length === 0 && (
                                    <div className="text-zinc-600 text-xs">No billable services</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Individual Resources */}
                    <div className="rounded-lg border border-zinc-800/40 bg-zinc-900/30 p-3">
                        <h5 className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2 flex items-center gap-1.5">
                            <Server className="h-3 w-3" /> Resource-Level Costs ({group.resources.length})
                        </h5>
                        <div className="space-y-1 max-h-[200px] overflow-y-auto">
                            {group.resources.map((r) => (
                                <div key={r.id}
                                    className={cn(
                                        "flex items-center justify-between text-[11px] py-1.5 px-2 rounded",
                                        r.isWasted ? "bg-red-950/20 border border-red-900/30" : "bg-zinc-900/50"
                                    )}
                                >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={cn(
                                            "w-1.5 h-1.5 rounded-full shrink-0",
                                            r.isWasted ? "bg-red-400" : r.monthlyEstimate > 0 ? "bg-emerald-400" : "bg-zinc-600"
                                        )} />
                                        <span className="text-zinc-300 font-medium truncate">{r.name}</span>
                                        <span className="text-[9px] text-zinc-600 uppercase shrink-0">{r.type}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[9px] text-zinc-500 hidden lg:block max-w-[200px] truncate">{r.details}</span>
                                        <span className={cn(
                                            "font-mono font-bold",
                                            r.isWasted ? "text-red-400" : "text-zinc-200"
                                        )}>${r.monthlyEstimate.toFixed(2)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Wasted Resources Warning */}
                    {group.wastedResources.length > 0 && (
                        <div className="rounded-lg border border-red-500/20 bg-red-950/10 p-3">
                            <h5 className="text-[9px] font-bold uppercase tracking-widest text-red-400 mb-2 flex items-center gap-1.5">
                                <AlertTriangle className="h-3 w-3" /> Wasted in this VPC ({group.wastedResources.length})
                            </h5>
                            <div className="space-y-1">
                                {group.wastedResources.map((r, i) => (
                                    <div key={i} className="flex items-center justify-between text-[11px] py-1 px-2 rounded bg-zinc-900/50">
                                        <div className="flex items-center gap-2">
                                            <span className="text-zinc-300">{r.name}</span>
                                            <span className="text-[9px] text-zinc-600 uppercase">{r.type}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] text-zinc-500">{r.wasteReason}</span>
                                            <span className="text-red-400 font-mono font-bold">${r.monthlyEstimate.toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function VpcCostEstimationPanel({ infraData, onClose }: { infraData: any; onClose: () => void }) {
    const { socket } = useSocket();
    const [costs, setCosts] = useState<VpcCostEstimation | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedVpcs, setExpandedVpcs] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!socket || !infraData) return;
        setLoading(true);
        socket.emit('estimate_costs_by_vpc', { infraData }, (res: any) => {
            setLoading(false);
            if (res.status === 'success') {
                setCosts(res.data);
                // Auto-expand the most expensive VPC
                if (res.data.vpcGroups.length > 0) {
                    setExpandedVpcs(new Set([res.data.vpcGroups[0].vpcId]));
                }
            }
        });
    }, [socket, infraData]);

    const toggleVpc = (vpcId: string) => {
        setExpandedVpcs(prev => {
            const next = new Set(prev);
            next.has(vpcId) ? next.delete(vpcId) : next.add(vpcId);
            return next;
        });
    };

    if (loading) {
        return (
            <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/50 p-6 flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 text-sky-400 animate-spin" />
                    <div className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Calculating VPC costs…</div>
                </div>
            </div>
        );
    }

    if (!costs) return null;

    const allGroups = [...costs.vpcGroups];
    if (costs.unattachedResources.resourceCount > 0) {
        allGroups.push(costs.unattachedResources);
    }

    // Pie chart data for VPC cost distribution
    const vpcPieData = allGroups
        .filter(g => g.totalMonthly > 0)
        .map(g => ({ name: g.vpcName, value: g.totalMonthly }));

    return (
        <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/20 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50">
                <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-sky-400" />
                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-300">VPC Cost Estimation</span>
                    <span className="text-[9px] bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded-full border border-sky-500/30 font-mono">
                        {costs.vpcGroups.length} VPCs
                    </span>
                </div>
                <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 transition cursor-pointer">
                    <X className="h-3.5 w-3.5 text-zinc-500" />
                </button>
            </div>

            <div className="p-4 space-y-4">
                {/* Grand Totals */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-center">
                        <div className="text-2xl font-mono font-bold text-sky-400">${costs.grandTotalMonthly.toFixed(2)}</div>
                        <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1">Total Monthly</div>
                    </div>
                    <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 px-4 py-3 text-center">
                        <div className="text-2xl font-mono font-bold text-violet-400">{costs.vpcGroups.length}</div>
                        <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1">Active VPCs</div>
                    </div>
                    <div className={cn("rounded-lg border px-4 py-3 text-center",
                        costs.grandWastedCost > 0 ? "border-red-500/20 bg-red-500/5" : "border-zinc-800/50 bg-zinc-900/30"
                    )}>
                        <div className={cn("text-2xl font-mono font-bold", costs.grandWastedCost > 0 ? "text-red-400" : "text-zinc-500")}>
                            ${costs.grandWastedCost.toFixed(2)}
                        </div>
                        <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1">Total Waste</div>
                    </div>
                </div>

                {/* VPC Cost Distribution Chart */}
                {vpcPieData.length > 1 && (
                    <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-3">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 flex items-center gap-1.5">
                            <Network className="h-3 w-3" /> Cost Distribution by VPC
                        </h4>
                        <div className="h-[140px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={vpcPieData}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={50}
                                        innerRadius={28}
                                        paddingAngle={3}
                                        strokeWidth={0}
                                    >
                                        {vpcPieData.map((_, i) => (
                                            <Cell key={i} fill={VPC_COLORS[i % VPC_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        {/* Legend */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-1">
                            {vpcPieData.map((d, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: VPC_COLORS[i % VPC_COLORS.length] }} />
                                    <span className="text-[9px] text-zinc-400 truncate max-w-[120px]">{d.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* VPC Cards */}
                <div className="space-y-2">
                    {allGroups.map((group, i) => (
                        <VpcCard
                            key={group.vpcId}
                            group={group}
                            index={i}
                            isExpanded={expandedVpcs.has(group.vpcId)}
                            onToggle={() => toggleVpc(group.vpcId)}
                        />
                    ))}
                </div>

                {allGroups.length === 0 && (
                    <div className="text-center py-8 text-zinc-600">
                        <Network className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        <p className="text-xs uppercase tracking-widest">No VPCs detected</p>
                    </div>
                )}

                {/* Disclaimer */}
                <div className="text-[9px] text-zinc-600 text-center">{costs.disclaimer}</div>
            </div>
        </div>
    );
}
