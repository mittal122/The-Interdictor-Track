import React from "react";
import { AlertTriangle, Plus, Trash2, X } from "lucide-react";

interface ConfirmActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    actionType: "LAUNCH" | "TERMINATE";
    instanceInfo?: string; // e.g. "i-0abcd12345"
    regionInfo?: string;
    isExecuting?: boolean;
}

export function ConfirmActionModal({
    isOpen,
    onClose,
    onConfirm,
    actionType,
    instanceInfo,
    regionInfo,
    isExecuting = false
}: ConfirmActionModalProps) {
    if (!isOpen) return null;

    const isTerminate = actionType === "TERMINATE";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
                {/* Header */}
                <div className={`flex items-center gap-3 border-b border-zinc-800/80 p-4 ${isTerminate ? "bg-red-950/20" : "bg-emerald-950/20"}`}>
                    {isTerminate ? (
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                    ) : (
                        <Plus className="h-5 w-5 text-emerald-500" />
                    )}
                    <h3 className="font-semibold text-zinc-100 uppercase tracking-wider text-sm flex-1">
                        {isTerminate ? "Confirm Termination" : "Launch Instance"}
                    </h3>
                    <button
                        onClick={onClose}
                        disabled={isExecuting}
                        className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 font-mono text-sm text-zinc-300">
                    {isTerminate ? (
                        <div className="space-y-4">
                            <p className="text-zinc-400">
                                You are about to permanently destroy an active AWS Compute Node. This action <span className="text-red-400 font-bold">cannot be undone</span>.
                            </p>
                            <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-3 flex flex-col gap-1">
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Instance ID:</span>
                                    <span className="font-bold text-red-400">{instanceInfo}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Region:</span>
                                    <span className="text-zinc-300">{regionInfo}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-zinc-400">
                                You are about to provision a new <span className="text-emerald-400 font-bold">t3.micro</span> EC2 Instance in your AWS Account. This will incur standard AWS hourly billing rates.
                            </p>
                            <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3 flex flex-col gap-1">
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Instance Type:</span>
                                    <span className="text-emerald-400 font-bold">t3.micro</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Region:</span>
                                    <span className="text-zinc-300">{regionInfo}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 border-t border-zinc-900 bg-zinc-950/50 p-4">
                    <button
                        onClick={onClose}
                        disabled={isExecuting}
                        className="rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isExecuting}
                        className={`flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isTerminate
                                ? "bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-900/50"
                                : "bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-900/50"
                            }`}
                    >
                        {isExecuting ? (
                            <>
                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                <span>Processing...</span>
                            </>
                        ) : (
                            <>
                                {isTerminate ? <Trash2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                <span>{isTerminate ? "Terminate Node" : "Launch Node"}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
