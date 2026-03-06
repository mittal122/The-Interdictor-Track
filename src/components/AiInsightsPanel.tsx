import React, { useState, useMemo } from 'react';
import { Sparkles, X, ShieldAlert, DollarSign, Activity, Wrench, ChevronDown, ChevronUp, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { cn } from '../utils/cn';
import { AiInsight } from '../utils/insightDeduplicator';
import { motion, AnimatePresence } from 'framer-motion';

interface AiInsightsPanelProps {
    insights: AiInsight[];
    loading: boolean;
    onClose: () => void;
    onInsightClick: (insight: AiInsight) => void;
}

export const AiInsightsPanel: React.FC<AiInsightsPanelProps> = ({ insights, loading, onClose, onInsightClick }) => {
    const [expandedInsightId, setExpandedInsightId] = useState<string | null>(null);

    const counts = useMemo(() => {
        return {
            high: insights.filter(i => i.severity === 'high').length,
            medium: insights.filter(i => i.severity === 'medium').length,
            low: insights.filter(i => i.severity === 'low').length,
        };
    }, [insights]);

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'security': return <ShieldAlert className="h-3.5 w-3.5" />;
            case 'cost': return <DollarSign className="h-3.5 w-3.5" />;
            case 'architecture': return <Wrench className="h-3.5 w-3.5" />;
            case 'operational': return <Activity className="h-3.5 w-3.5" />;
            default: return <Sparkles className="h-3.5 w-3.5" />;
        }
    };

    const getSeverityConfig = (severity: string) => {
        switch (severity) {
            case 'high': return { icon: <AlertTriangle className="h-3.5 w-3.5" />, colors: 'text-red-400 bg-red-500/10 border-red-500/30', label: 'HIGH RISK' };
            case 'medium': return { icon: <AlertCircle className="h-3.5 w-3.5" />, colors: 'text-amber-400 bg-amber-500/10 border-amber-500/30', label: 'MEDIUM RISK' };
            case 'low': return { icon: <Info className="h-3.5 w-3.5" />, colors: 'text-sky-400 bg-sky-500/10 border-sky-500/30', label: 'LOW RISK' };
            default: return { icon: <Info className="h-3.5 w-3.5" />, colors: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30', label: 'INFO' };
        }
    };

    return (
        <div className="flex flex-col rounded-xl border border-violet-500/30 bg-[#0c0c0e] text-zinc-300 overflow-hidden w-full h-[600px] shadow-2xl shadow-violet-900/10 relative">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-violet-500/20 bg-violet-950/20">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-violet-400" />
                    <div>
                        <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-widest">AI Infrastructure Analyst</h2>
                        <p className="text-[10px] text-zinc-500 tracking-wider">Automated expert architecture review</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 transition">
                    <X className="h-4 w-4" />
                </button>
            </div>

            {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                    <div className="relative">
                        <Sparkles className="h-10 w-10 text-violet-500/50 animate-pulse absolute inset-0 blur-md" />
                        <Sparkles className="h-10 w-10 text-violet-400 animate-pulse relative z-10" />
                    </div>
                    <p className="text-sm text-violet-300 font-bold tracking-widest uppercase animate-pulse">Analyzing Infrastructure Data...</p>
                    <p className="text-xs text-zinc-500">The AI is reviewing your architecture for risks.</p>
                </div>
            ) : insights.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
                    <Wrench className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-xs font-bold uppercase tracking-wider">No Insights Generated</p>
                </div>
            ) : (
                <div className="flex-1 flex flex-col min-h-0">
                    {/* Summary Bar */}
                    <div className="flex items-center gap-4 px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 text-[10px] font-bold tracking-widest shrink-0">
                        <div className="flex items-center gap-1.5 text-zinc-400">
                            <span>TOTAL:</span>
                            <span className="text-zinc-200">{insights.length}</span>
                        </div>
                        <div className="w-px h-3 bg-zinc-700"></div>
                        <div className="flex items-center gap-1.5 text-red-400">
                            <span>HIGH:</span>
                            <span>{counts.high}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-amber-400">
                            <span>MED:</span>
                            <span>{counts.medium}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sky-400">
                            <span>LOW:</span>
                            <span>{counts.low}</span>
                        </div>
                    </div>

                    {/* Scrollable Insight List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {insights.map((insight, idx) => {
                            const isExpanded = expandedInsightId === insight.id;
                            const sevConfig = getSeverityConfig(insight.severity);

                            return (
                                <div
                                    key={insight.id || idx}
                                    className={cn(
                                        "rounded-lg border bg-zinc-900/40 transition-all duration-200 overflow-hidden cursor-pointer",
                                        isExpanded ? "border-violet-500/50 shadow-lg shadow-violet-900/20" : "border-zinc-800 hover:border-zinc-700"
                                    )}
                                    onClick={() => {
                                        setExpandedInsightId(isExpanded ? null : insight.id);
                                        onInsightClick(insight);
                                    }}
                                >
                                    <div className="p-3 flex items-start gap-3">
                                        <div className={cn("p-1.5 rounded-md flex-shrink-0 mt-0.5", sevConfig.colors)}>
                                            {sevConfig.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-4 mb-1">
                                                <h4 className="text-sm font-bold text-zinc-200 truncate">{insight.title}</h4>
                                                {isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" /> : <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />}
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-wider">
                                                <span className={cn("px-1.5 py-0.5 rounded", sevConfig.colors)}>
                                                    {sevConfig.label}
                                                </span>
                                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                                                    {getCategoryIcon(insight.category)}
                                                    {insight.category}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="border-t border-zinc-800 bg-zinc-950/30"
                                            >
                                                <div className="p-4 space-y-4">
                                                    <div>
                                                        <h5 className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1">Observation</h5>
                                                        <p className="text-xs text-zinc-300 leading-relaxed">{insight.description}</p>
                                                    </div>

                                                    {(insight.affectedResources?.length ?? 0) > 0 && (
                                                        <div>
                                                            <h5 className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1.5">Affected Resources</h5>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {insight.affectedResources.map((resId, i) => (
                                                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded font-mono bg-zinc-800 border border-zinc-700 text-zinc-300">
                                                                        {resId}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="bg-violet-950/20 border border-violet-900/50 rounded-lg p-3">
                                                        <h5 className="text-[10px] uppercase tracking-widest font-bold text-violet-400 mb-1 flex items-center gap-1.5">
                                                            <Sparkles className="h-3 w-3" /> Recommended Action
                                                        </h5>
                                                        <p className="text-xs text-violet-200">{insight.recommendedAction}</p>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
