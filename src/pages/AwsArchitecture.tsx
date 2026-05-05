import React, { useState, useMemo, useCallback } from "react";
import {
    Cloud, Server, HardDrive, Globe2, Network, Shield, Radio, Zap, Database,
    Play, Square, Trash2, Loader2, ChevronDown, ChevronRight, AlertTriangle,
    CheckCircle2, XCircle, CircleDot, Search, RefreshCw, Boxes, Layers, GitMerge, Lock,
    DollarSign, FileCode, Box, Maximize, Minimize, Sparkles
} from "lucide-react";
import ReactFlow, { Background, Controls, MarkerType, NodeProps, Handle, Position, Edge, Node as FlowNode } from 'reactflow';
import 'reactflow/dist/style.css';
import { cn } from "../utils/cn";
import { useSocket } from "../contexts/SocketContext";
import { useAppMode } from "../contexts/AppModeContext";
import { Isometric3DView } from "../components/Isometric3DView";
import { CostEstimationPanel } from "../components/CostEstimationPanel";
import { VpcCostEstimationPanel } from "../components/VpcCostEstimationPanel";
import { TerraformExportModal } from "../components/TerraformExportModal";
import { AiInsightsPanel } from "../components/AiInsightsPanel";
import { AiInsight } from "../utils/insightDeduplicator";
import { filterInfrastructureByVpc } from "../utils/vpcInfrastructureFilter";

// ── Constants ─────────────────────────────────────────────────────────────
const API_COST_MAP: Record<string, string> = {
    scan_account: "$0.002",
    estimate_costs: "$0.001",
    terraform_export: "$0.0005",
    start_instance: "Free",
    stop_instance: "Free",
};

// ── Types ─────────────────────────────────────────────────────────────────
type ResourceStatus = "active" | "stopped" | "idle" | "orphan" | "pending";

interface InfraNode {
    id: string; type: string; category: string; name: string;
    region: string; status: ResourceStatus; meta: Record<string, any>;
    instanceId?: string;
}
interface InfraEdge { source: string; target: string; label: string; }
interface InfraMap {
    nodes: InfraNode[]; edges: InfraEdge[];
    summary: { totalResources: number; activeCount: number; stoppedCount: number; orphanCount: number; idleCount: number; regionCount: number; serviceTypes: string[]; };
    fetchedAt: number;
    liveAccountId?: string;
}

// ── Demo Data ─────────────────────────────────────────────────────────────
function generateDemoInfra(): InfraMap {
    const nodes: InfraNode[] = [
        // VPCs
        { id: "vpc-us-east-1-vpc-demo01", type: "vpc", category: "networking", name: "Production VPC", region: "us-east-1", status: "active", meta: { vpcId: "vpc-demo01", cidr: "10.0.0.0/16", isDefault: false } },
        { id: "vpc-us-east-1-vpc-demo02", type: "vpc", category: "networking", name: "Default VPC", region: "us-east-1", status: "active", meta: { vpcId: "vpc-demo02", cidr: "172.31.0.0/16", isDefault: true } },
        // Subnets
        { id: "subnet-us-east-1-sub-pub01", type: "subnet", category: "networking", name: "Public Subnet A", region: "us-east-1", status: "active", meta: { subnetId: "sub-pub01", vpcId: "vpc-demo01", cidr: "10.0.1.0/24", az: "us-east-1a", isPublic: true } },
        { id: "subnet-us-east-1-sub-prv01", type: "subnet", category: "networking", name: "Private Subnet A", region: "us-east-1", status: "active", meta: { subnetId: "sub-prv01", vpcId: "vpc-demo01", cidr: "10.0.2.0/24", az: "us-east-1a", isPublic: false } },
        { id: "subnet-us-east-1-sub-prv02", type: "subnet", category: "networking", name: "Private Subnet B", region: "us-east-1", status: "active", meta: { subnetId: "sub-prv02", vpcId: "vpc-demo01", cidr: "10.0.3.0/24", az: "us-east-1b", isPublic: false } },
        // IGW
        { id: "igw-us-east-1-igw-demo01", type: "igw", category: "networking", name: "Main IGW", region: "us-east-1", status: "active", meta: { igwId: "igw-demo01", attachedVpc: "vpc-demo01" } },
        // NAT
        { id: "nat-us-east-1-nat-demo01", type: "nat", category: "networking", name: "NAT Gateway", region: "us-east-1", status: "active", meta: { natId: "nat-demo01", subnetId: "sub-pub01", vpcId: "vpc-demo01" } },
        // Security Groups
        { id: "sg-us-east-1-sg-web", type: "sg", category: "networking", name: "web-server-sg", region: "us-east-1", status: "active", meta: { sgId: "sg-web", vpcId: "vpc-demo01", inboundRules: 3, outboundRules: 1 } },
        { id: "sg-us-east-1-sg-db", type: "sg", category: "networking", name: "database-sg", region: "us-east-1", status: "active", meta: { sgId: "sg-db", vpcId: "vpc-demo01", inboundRules: 1, outboundRules: 1 } },
        { id: "sg-us-east-1-sg-unused", type: "sg", category: "networking", name: "old-test-sg", region: "us-east-1", status: "idle", meta: { sgId: "sg-unused", vpcId: "vpc-demo01", inboundRules: 0, outboundRules: 1 } },
        // Route Tables
        { id: "rt-us-east-1-rt-main", type: "route-table", category: "networking", name: "Main RT", region: "us-east-1", status: "active", meta: { rtId: "rt-main", vpcId: "vpc-demo01", routeCount: 3 } },
        // EC2
        { id: "ec2-us-east-1-i-web01", type: "ec2", category: "compute", name: "Web-Server-01", region: "us-east-1", status: "active", instanceId: "i-web01", meta: { instanceId: "i-web01", type: "t3.micro", subnetId: "sub-pub01", vpcId: "vpc-demo01", publicIp: "54.123.45.67", state: "running" } },
        { id: "ec2-us-east-1-i-web02", type: "ec2", category: "compute", name: "Web-Server-02", region: "us-east-1", status: "active", instanceId: "i-web02", meta: { instanceId: "i-web02", type: "t3.micro", subnetId: "sub-pub01", vpcId: "vpc-demo01", publicIp: "54.123.45.68", state: "running" } },
        { id: "ec2-us-east-1-i-api01", type: "ec2", category: "compute", name: "API-Backend", region: "us-east-1", status: "active", instanceId: "i-api01", meta: { instanceId: "i-api01", type: "t3.small", subnetId: "sub-prv01", vpcId: "vpc-demo01", state: "running" } },
        { id: "ec2-us-east-1-i-db01", type: "ec2", category: "compute", name: "DB-Primary", region: "us-east-1", status: "active", instanceId: "i-db01", meta: { instanceId: "i-db01", type: "m5.large", subnetId: "sub-prv02", vpcId: "vpc-demo01", state: "running" } },
        { id: "ec2-us-east-1-i-dev01", type: "ec2", category: "compute", name: "Dev-Box", region: "us-east-1", status: "stopped", instanceId: "i-dev01", meta: { instanceId: "i-dev01", type: "t2.micro", subnetId: "sub-pub01", vpcId: "vpc-demo02", state: "stopped" } },
        // EBS
        { id: "ebs-us-east-1-vol-01", type: "ebs", category: "storage", name: "Web Root Vol", region: "us-east-1", status: "active", meta: { volumeId: "vol-01", size: 20, volumeType: "gp3", attachedTo: "i-web01" } },
        { id: "ebs-us-east-1-vol-02", type: "ebs", category: "storage", name: "DB Data Vol", region: "us-east-1", status: "active", meta: { volumeId: "vol-02", size: 500, volumeType: "io2", attachedTo: "i-db01" } },
        { id: "ebs-us-east-1-vol-orphan", type: "ebs", category: "storage", name: "Old Snapshot Vol", region: "us-east-1", status: "orphan", meta: { volumeId: "vol-orphan", size: 50, volumeType: "gp3" } },
        // EIP
        { id: "eip-us-east-1-eip-01", type: "eip", category: "networking", name: "54.200.10.5", region: "us-east-1", status: "active", meta: { publicIp: "54.200.10.5", instanceId: "i-web01" } },
        { id: "eip-us-east-1-eip-orphan", type: "eip", category: "networking", name: "54.200.10.99", region: "us-east-1", status: "orphan", meta: { publicIp: "54.200.10.99" } },
        // ELB
        { id: "elb-us-east-1-alb-main", type: "elb", category: "load-balancing", name: "prod-alb", region: "us-east-1", status: "active", meta: { type: "application", scheme: "internet-facing", vpcId: "vpc-demo01", dnsName: "prod-alb-123.us-east-1.elb.amazonaws.com" } },
        // Target Group
        { id: "tg-us-east-1-tg-web", type: "target-group", category: "load-balancing", name: "web-targets", region: "us-east-1", status: "active", meta: { protocol: "HTTP", port: 80, vpcId: "vpc-demo01" } },
        // Lambda
        { id: "lambda-us-east-1-auth-handler", type: "lambda", category: "compute", name: "auth-handler", region: "us-east-1", status: "active", meta: { runtime: "nodejs18.x", memoryMB: 128, timeout: 30 } },
        { id: "lambda-us-east-1-image-resize", type: "lambda", category: "compute", name: "image-resizer", region: "us-east-1", status: "active", meta: { runtime: "python3.11", memoryMB: 512, timeout: 60 } },
        // S3
        { id: "s3-global-my-app-assets", type: "s3", category: "storage", name: "my-app-assets", region: "global", status: "active", meta: { name: "my-app-assets" } },
        { id: "s3-global-backup-bucket", type: "s3", category: "storage", name: "company-backups", region: "global", status: "active", meta: { name: "company-backups" } },
        { id: "s3-global-logs-bucket", type: "s3", category: "storage", name: "access-logs-2024", region: "global", status: "active", meta: { name: "access-logs-2024" } },
    ];

    const edges: InfraEdge[] = [
        // VPC structure
        { source: "vpc-us-east-1-vpc-demo01", target: "subnet-us-east-1-sub-pub01", label: "contains" },
        { source: "vpc-us-east-1-vpc-demo01", target: "subnet-us-east-1-sub-prv01", label: "contains" },
        { source: "vpc-us-east-1-vpc-demo01", target: "subnet-us-east-1-sub-prv02", label: "contains" },
        { source: "igw-us-east-1-igw-demo01", target: "vpc-us-east-1-vpc-demo01", label: "attached-to" },
        { source: "nat-us-east-1-nat-demo01", target: "subnet-us-east-1-sub-pub01", label: "in-subnet" },
        // EC2 in subnets
        { source: "subnet-us-east-1-sub-pub01", target: "ec2-us-east-1-i-web01", label: "hosts" },
        { source: "subnet-us-east-1-sub-pub01", target: "ec2-us-east-1-i-web02", label: "hosts" },
        { source: "subnet-us-east-1-sub-prv01", target: "ec2-us-east-1-i-api01", label: "hosts" },
        { source: "subnet-us-east-1-sub-prv02", target: "ec2-us-east-1-i-db01", label: "hosts" },
        // SG attachments
        { source: "ec2-us-east-1-i-web01", target: "sg-us-east-1-sg-web", label: "uses-sg" },
        { source: "ec2-us-east-1-i-web02", target: "sg-us-east-1-sg-web", label: "uses-sg" },
        { source: "ec2-us-east-1-i-db01", target: "sg-us-east-1-sg-db", label: "uses-sg" },
        // EBS
        { source: "ec2-us-east-1-i-web01", target: "ebs-us-east-1-vol-01", label: "attached-volume" },
        { source: "ec2-us-east-1-i-db01", target: "ebs-us-east-1-vol-02", label: "attached-volume" },
        // ELB
        { source: "vpc-us-east-1-vpc-demo01", target: "elb-us-east-1-alb-main", label: "contains-elb" },
        { source: "elb-us-east-1-alb-main", target: "tg-us-east-1-tg-web", label: "routes-to" },
        // Route Tables
        { source: "vpc-us-east-1-vpc-demo01", target: "rt-us-east-1-rt-main", label: "has-route-table" },
    ];

    return {
        nodes, edges,
        summary: {
            totalResources: nodes.length,
            activeCount: nodes.filter(n => n.status === "active").length,
            stoppedCount: nodes.filter(n => n.status === "stopped").length,
            orphanCount: nodes.filter(n => n.status === "orphan").length,
            idleCount: nodes.filter(n => n.status === "idle").length,
            regionCount: 1,
            serviceTypes: [...new Set(nodes.map(n => n.type))],
        },
        fetchedAt: Date.now(),
    };
}

// ── Icon Map ──────────────────────────────────────────────────────────────
const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
    vpc: Globe2, subnet: Layers, igw: Radio, nat: Radio, "route-table": Network,
    sg: Shield, ec2: Server, ebs: HardDrive, eip: CircleDot,
    elb: Zap, "target-group": Zap, lambda: Zap, s3: Database,
};
const TYPE_LABEL: Record<string, string> = {
    vpc: "VPC", subnet: "Subnet", igw: "Internet Gateway", nat: "NAT Gateway",
    "route-table": "Route Table", sg: "Security Group", ec2: "EC2 Instance",
    ebs: "EBS Volume", eip: "Elastic IP", elb: "Load Balancer",
    "target-group": "Target Group", lambda: "Lambda Function", s3: "S3 Bucket",
};
const CATEGORY_LABEL: Record<string, string> = {
    networking: "Networking", compute: "Compute", storage: "Storage", "load-balancing": "Load Balancing",
};
const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
    active: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: CheckCircle2, label: "Active" },
    stopped: { color: "text-zinc-500", bg: "bg-zinc-500/10", border: "border-zinc-600/30", icon: XCircle, label: "Stopped" },
    idle: { color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", icon: CircleDot, label: "Idle" },
    orphan: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", icon: AlertTriangle, label: "Orphan" },
    pending: { color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", icon: Loader2, label: "Pending" },
};

// ── StatusBadge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ResourceStatus }) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.stopped;
    const Icon = cfg.icon;
    return (
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest", cfg.color, cfg.bg, cfg.border)}>
            {Icon && <Icon className={cn("h-2.5 w-2.5", status === "pending" && "animate-spin")} />}
            {cfg.label}
        </span>
    );
}

// ── Theming ───────────────────────────────────────────────────────────────
const CAT_THEME: Record<string, { border: string, bg: string, text: string, iconBg: string }> = {
    compute: { border: "border-orange-500/50", bg: "bg-orange-950/20", text: "text-orange-400", iconBg: "bg-orange-500/20" },
    database: { border: "border-blue-500/50", bg: "bg-blue-950/20", text: "text-blue-400", iconBg: "bg-blue-500/20" },
    storage: { border: "border-emerald-500/50", bg: "bg-emerald-950/20", text: "text-emerald-400", iconBg: "bg-emerald-500/20" },
    networking: { border: "border-purple-500/50", bg: "bg-purple-950/20", text: "text-purple-400", iconBg: "bg-purple-500/20" },
    security: { border: "border-red-500/50", bg: "bg-red-950/20", text: "text-red-400", iconBg: "bg-red-500/20" },
    identity: { border: "border-pink-500/50", bg: "bg-pink-950/20", text: "text-pink-400", iconBg: "bg-pink-500/20" },
    "load-balancing": { border: "border-indigo-500/50", bg: "bg-indigo-950/20", text: "text-indigo-400", iconBg: "bg-indigo-500/20" }
};

// ── Custom ReactFlow Nodes ────────────────────────────────────────────────
function CustomNode({ data }: NodeProps) {
    const theme = CAT_THEME[data.node.category] || { border: "border-zinc-700", bg: "bg-zinc-900/50", text: "text-zinc-300", iconBg: "bg-zinc-800" };
    const Icon = TYPE_ICON[data.node.type] || Boxes;
    const isSelected = data.selected;

    return (
        <div className={cn(
            "relative flex flex-col items-center justify-center p-3 rounded-xl border-2 shadow-lg min-w-[140px] transition-all backdrop-blur-sm",
            theme.bg,
            // When grouped, we need the background to be solid to occlude the group border behind it, so we add bg-zinc-950
            "bg-zinc-950",
            isSelected ? "border-sky-500 shadow-sky-500/30 scale-105 z-50" : theme.border,
            STATUS_CONFIG[data.node.status]?.border.replace("border-", "border-l-4 border-l-")
        )}>
            <Handle type="target" position={Position.Left} className="!bg-zinc-500 !w-2 !h-2 !border-none" />

            <div className="flex flex-col items-center gap-2 w-full">
                <div className={cn("p-2 rounded-lg", theme.iconBg)}>
                    {Icon && typeof Icon !== 'string' ? <Icon className={cn("h-6 w-6", theme.text)} /> : <Boxes className={cn("h-6 w-6", theme.text)} />}
                </div>
                <div className="text-[11px] font-bold text-zinc-100 text-center leading-tight truncate w-full px-1" title={data.node.name}>
                    {data.node.name}
                </div>
                <div className="flex items-center gap-1.5 justify-center w-full">
                    <div className={cn("w-2 h-2 rounded-full", STATUS_CONFIG[data.node.status]?.bg.replace("/10", ""), STATUS_CONFIG[data.node.status]?.color.replace("text-", "bg-"))} />
                    <div className="text-[9px] text-zinc-400 uppercase tracking-widest font-semibold flex items-center gap-1">
                        {TYPE_LABEL[data.node.type] || data.node.type}
                        {data.node.meta?.isPublic === false && <Lock className="h-2 w-2 text-zinc-500" />}
                    </div>
                </div>
            </div>

            <Handle type="source" position={Position.Right} className="!bg-zinc-500 !w-2 !h-2 !border-none" />
        </div>
    );
}

function GroupNode({ data }: NodeProps) {
    const isVpc = data.node.type === "vpc";
    return (
        <div className={cn(
            "w-full h-full rounded-2xl border-2 border-dashed relative p-4 transition-colors",
            isVpc ? "border-emerald-500/30 bg-emerald-950/10" : "border-sky-500/30 bg-sky-950/10"
        )}>
            <div className="absolute -top-3 left-4 flex items-center gap-2 bg-zinc-950 px-3 py-1 rounded-md border border-zinc-800 shadow-md">
                {isVpc ? <Globe2 className="h-3 w-3 text-emerald-400" /> : <Layers className="h-3 w-3 text-sky-400" />}
                <span className={cn(
                    "text-[10px] font-black uppercase tracking-widest",
                    isVpc ? "text-emerald-400" : "text-sky-400"
                )}>{data.node.name}</span>
            </div>
            {/* The nodes will be populated here by ReactFlow's parentNode mechanic */}
        </div>
    );
}

const nodeTypes = { custom: CustomNode, group: GroupNode };

// ── Edge Color Classification ─────────────────────────────────────────────
type EdgeCategory = 'networking' | 'traffic' | 'data' | 'security' | 'generic';

const EDGE_COLORS: Record<EdgeCategory, { stroke: string; glow: string; label: string }> = {
    networking: { stroke: '#38bdf8', glow: '0 0 8px #38bdf880', label: '#7dd3fc' },
    traffic: { stroke: '#f97316', glow: '0 0 8px #f9731680', label: '#fdba74' },
    data: { stroke: '#22c55e', glow: '0 0 8px #22c55e80', label: '#86efac' },
    security: { stroke: '#a855f7', glow: '0 0 8px #a855f780', label: '#c084fc' },
    generic: { stroke: '#71717a', glow: '0 0 6px #71717a60', label: '#a1a1aa' },
};

function classifyEdge(label: string): EdgeCategory {
    if (['hosts', 'attached-to', 'contains-elb', 'has-route-table'].includes(label)) return 'networking';
    if (label.includes('routes') || label.includes('forward')) return 'traffic';
    if (label.includes('volume') || label.includes('storage') || label.includes('backup') || label.includes('s3')) return 'data';
    if (label.includes('sg') || label.includes('iam') || label.includes('policy') || label.includes('role') || label.includes('permission')) return 'security';
    return 'generic';
}

// ── Graph Component (AI-Assisted Layout) ──────────────────────────────────
interface LayoutPlan {
    nodes: { id: string; x: number; y: number; section: string }[];
    sections: { name: string; x: number; y: number; width: number; height: number }[];
    isAIGenerated: boolean;
}

function applyLayoutPlan(
    data: InfraMap,
    layout: LayoutPlan,
    selectedNodeId: string | null,
    hoveredNodeId: string | null,
    hoveredEdgeId: string | null
) {
    const posMap = new Map(layout.nodes.map(n => [n.id, n]));

    const groups: FlowNode[] = layout.sections.map((section, i) => ({
        id: `section-${i}`,
        type: "group",
        position: { x: section.x, y: section.y },
        data: {
            node: {
                id: `section-${i}`, type: "vpc", category: "networking",
                name: section.name, region: "", status: "active" as ResourceStatus, meta: {}
            }
        },
        style: { width: section.width, height: section.height, zIndex: -2 },
        draggable: false,
    }));

    const elements: FlowNode[] = data.nodes.map(node => {
        const layoutPos = posMap.get(node.id);
        return {
            id: node.id,
            type: "custom",
            position: { x: layoutPos?.x ?? 0, y: layoutPos?.y ?? 0 },
            data: { node, selected: node.id === selectedNodeId },
            draggable: true,
        };
    });

    // Determine active edges/nodes for hover highlighting
    const activeEdgeIds = new Set<string>();
    const activeNodeIds = new Set<string>();
    if (hoveredNodeId) {
        activeNodeIds.add(hoveredNodeId);
        data.edges.forEach(edge => {
            if (edge.source === hoveredNodeId || edge.target === hoveredNodeId) {
                activeEdgeIds.add(`${edge.source}-${edge.target}`);
                activeNodeIds.add(edge.source);
                activeNodeIds.add(edge.target);
            }
        });
    }
    if (hoveredEdgeId) activeEdgeIds.add(hoveredEdgeId);

    const hasHoverContext = hoveredNodeId !== null || hoveredEdgeId !== null;

    // Build edges with category-based colors and hover dimming
    const fEdges: Edge[] = [];
    data.edges.forEach(edge => {
        if (edge.label === "contains" || edge.label === "in-subnet") return;

        const edgeId = `${edge.source}-${edge.target}`;
        const category = classifyEdge(edge.label);
        const colors = EDGE_COLORS[category];
        const isActive = activeEdgeIds.has(edgeId);
        const isDimmed = hasHoverContext && !isActive;

        const strokeColor = isDimmed ? `${colors.stroke}30` : colors.stroke;
        const labelColor = isDimmed ? `${colors.label}40` : colors.label;
        const strokeWidth = isActive ? 3.5 : (isDimmed ? 1.5 : 2.5);

        fEdges.push({
            id: edgeId,
            source: edge.source,
            target: edge.target,
            label: (isActive || !hasHoverContext) ? edge.label : undefined,
            type: 'smoothstep',
            animated: isActive,
            style: {
                stroke: strokeColor,
                strokeWidth,
                transition: 'stroke 0.3s ease, stroke-width 0.3s ease, opacity 0.3s ease',
                filter: isActive ? `drop-shadow(${colors.glow})` : undefined,
                opacity: isDimmed ? 0.25 : 1,
            },
            labelStyle: { fill: labelColor, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em' },
            labelBgStyle: { fill: "#09090b", color: "#fff", fillOpacity: 0.95, borderRadius: 6 },
            markerEnd: { type: MarkerType.ArrowClosed, color: isDimmed ? `${colors.stroke}40` : colors.stroke, width: 16, height: 16 },
            zIndex: isActive ? 100 : 0,
        });
    });

    return { nodes: [...groups, ...elements], edges: fEdges };
}

function EdgeLegend() {
    const items: { cat: EdgeCategory; label: string }[] = [
        { cat: 'networking', label: 'Networking' },
        { cat: 'traffic', label: 'Traffic' },
        { cat: 'data', label: 'Data' },
        { cat: 'security', label: 'Security' },
        { cat: 'generic', label: 'Other' },
    ];
    return (
        <div className="absolute bottom-3 right-3 z-10 bg-zinc-950/90 backdrop-blur-sm border border-zinc-800 rounded-lg px-3 py-2 flex items-center gap-3">
            {items.map(({ cat, label }) => (
                <div key={cat} className="flex items-center gap-1.5">
                    <div className="w-5 h-[3px] rounded-full" style={{ backgroundColor: EDGE_COLORS[cat].stroke }} />
                    <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: EDGE_COLORS[cat].label }}>{label}</span>
                </div>
            ))}
        </div>
    );
}

function ArchitectureGraph({ data, selectedNodeId, onSelect }: { data: InfraMap; selectedNodeId: string | null; onSelect: (node: InfraNode) => void }) {
    const { socket } = useSocket();
    const [layoutPlan, setLayoutPlan] = React.useState<LayoutPlan | null>(null);
    const [layoutLoading, setLayoutLoading] = React.useState(false);
    const [layoutError, setLayoutError] = React.useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null);
    const [hoveredEdgeId, setHoveredEdgeId] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!data) return;
        setLayoutLoading(true);
        setLayoutError(null);
        if (socket) {
            socket.emit("generate_graph_layout", { infraData: data }, (res: any) => {
                setLayoutLoading(false);
                if (res.status === "error") setLayoutError(res.message);
                else setLayoutPlan(res.data);
            });
        } else {
            const fallbackNodes = data.nodes.map((n, i) => ({
                id: n.id, x: 40 + (i % 6) * 220, y: 40 + Math.floor(i / 6) * 180, section: "All Resources"
            }));
            const totalRows = Math.ceil(data.nodes.length / 6);
            setLayoutPlan({
                nodes: fallbackNodes,
                sections: [{ name: "All Resources", x: 0, y: 0, width: 1400, height: totalRows * 180 + 100 }],
                isAIGenerated: false
            });
            setLayoutLoading(false);
        }
    }, [data, socket]);

    const { nodes: flowNodes, edges: flowEdges } = useMemo(() => {
        if (!layoutPlan) return { nodes: [], edges: [] };
        return applyLayoutPlan(data, layoutPlan, selectedNodeId, hoveredNodeId, hoveredEdgeId);
    }, [data, layoutPlan, selectedNodeId, hoveredNodeId, hoveredEdgeId]);

    const onNodeMouseEnter = useCallback((_: any, node: FlowNode) => {
        if (node.id && !node.id.startsWith('section-')) setHoveredNodeId(node.id);
    }, []);
    const onNodeMouseLeave = useCallback(() => setHoveredNodeId(null), []);
    const onEdgeMouseEnter = useCallback((_: any, edge: Edge) => setHoveredEdgeId(edge.id), []);
    const onEdgeMouseLeave = useCallback(() => setHoveredEdgeId(null), []);

    if (layoutLoading) {
        return (
            <div className="w-full h-full bg-zinc-950/50 rounded-xl border border-zinc-800/50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 animate-pulse">
                    <div className="relative">
                        <Loader2 className="h-10 w-10 text-sky-400 animate-spin" />
                        <div className="absolute inset-0 h-10 w-10 rounded-full bg-sky-500/20 animate-ping" />
                    </div>
                    <div className="text-sm font-mono text-sky-300 tracking-wider uppercase">🤖 AI is planning your layout...</div>
                    <div className="text-[10px] text-zinc-500">Analyzing {data.nodes.length} resources and {data.edges.length} connections</div>
                </div>
            </div>
        );
    }

    if (layoutError) {
        return (
            <div className="w-full h-full bg-zinc-950/50 rounded-xl border border-red-800/50 flex items-center justify-center">
                <div className="text-center">
                    <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                    <div className="text-sm text-red-300">Layout Error: {layoutError}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full bg-zinc-950/50 rounded-xl border border-zinc-800/50 overflow-hidden relative">
            {layoutPlan && (
                <div className="absolute top-3 right-3 z-10">
                    <span className={cn(
                        "text-[9px] font-mono uppercase tracking-widest px-2 py-1 rounded-full border",
                        layoutPlan.isAIGenerated
                            ? "text-emerald-400 bg-emerald-950/50 border-emerald-500/30"
                            : "text-sky-400 bg-sky-950/50 border-sky-500/30"
                    )}>
                        {layoutPlan.isAIGenerated ? "🤖 AI Layout" : "📐 Auto Layout"}
                    </span>
                </div>
            )}
            <EdgeLegend />
            <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={nodeTypes}
                onNodeClick={(_, node) => { if (node.data?.node) onSelect(node.data.node); }}
                onNodeMouseEnter={onNodeMouseEnter}
                onNodeMouseLeave={onNodeMouseLeave}
                onEdgeMouseEnter={onEdgeMouseEnter}
                onEdgeMouseLeave={onEdgeMouseLeave}
                fitView
                className="w-full h-full"
                minZoom={0.05}
                maxZoom={1.5}
            >

                <Controls className="!bg-zinc-900 border !border-zinc-800 !fill-zinc-400" />
            </ReactFlow>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────
export function AwsArchitecture() {
    const { socket, connectionState } = useSocket();
    const { mode } = useAppMode();

    const [infraData, setInfraData] = useState<InfraMap | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState("");
    const [selectedRegion, setSelectedRegion] = useState<string>("global");
    const [selectedVpc, setSelectedVpc] = useState<string>("all");
    // View States
    const [viewMode, setViewMode] = useState<"tree" | "graph" | "3d">("tree");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [showCostPanel, setShowCostPanel] = useState(false);
    const [showVpcCostPanel, setShowVpcCostPanel] = useState(false);
    const [showTfExport, setShowTfExport] = useState(false);

    const [showAiInsights, setShowAiInsights] = useState(false);
    const [aiInsights, setAiInsights] = useState<AiInsight[]>([]);
    const [aiInsightsLoading, setAiInsightsLoading] = useState(false);

    const isLive = !!infraData?.liveAccountId; // Changed definition of isLive

    // Fullscreen listener
    React.useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleFullscreen = () => {
        if (!isFullscreen) {
            containerRef.current?.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message}`);
            });
        } else {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            }
        }
    };

    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["networking", "compute", "storage", "load-balancing", "database", "security"]));
    const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
    const [selectedNode, setSelectedNode] = useState<InfraNode | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const demo = useMemo(() => generateDemoInfra(), []);
    const rawData = infraData || (isLive ? null : demo);

    // Extract unique regions from the dataset
    const availableRegions = useMemo(() => {
        if (!rawData) return [];
        const regions = [...new Set(rawData.nodes.map(n => n.region))].filter(Boolean).sort();
        return regions;
    }, [rawData]);

    // Extract available VPCs from the region-filtered data
    const availableVpcs = useMemo(() => {
        if (!rawData) return [];
        let nodes = rawData.nodes;
        if (selectedRegion !== "global") {
            nodes = nodes.filter(n => n.region === selectedRegion);
        }
        const vpcs = nodes.filter(n => n.category === "networking" && n.type === "vpc");
        return vpcs.map(v => ({ id: v.id, name: v.name || v.id })).sort((a, b) => a.name.localeCompare(b.name));
    }, [rawData, selectedRegion]);

    // Filter data by selected region and VPC
    const data = useMemo((): InfraMap | null => {
        if (!rawData) return null;
        let filteredMap = rawData;

        if (selectedRegion !== "global") {
            const filteredNodes = rawData.nodes.filter(n => n.region === selectedRegion);
            const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
            const filteredEdges = rawData.edges.filter(e => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target));

            filteredMap = {
                ...rawData,
                nodes: filteredNodes,
                edges: filteredEdges,
                summary: {
                    ...rawData.summary,
                    totalResources: filteredNodes.length,
                    activeCount: filteredNodes.filter(n => n.status === "active").length,
                    stoppedCount: filteredNodes.filter(n => n.status === "stopped").length,
                    orphanCount: filteredNodes.filter(n => n.status === "orphan").length,
                    idleCount: filteredNodes.filter(n => n.status === "idle").length,
                    regionCount: 1,
                    serviceTypes: [...new Set(filteredNodes.map(n => n.type))],
                }
            };
        }

        if (selectedVpc !== "all") {
            filteredMap = filterInfrastructureByVpc(filteredMap, selectedVpc) || filteredMap;
        }

        return filteredMap;
    }, [rawData, selectedRegion, selectedVpc]);

    // Fetch handler
    const handleFetch = useCallback(() => {
        if (!socket || !isLive) return;
        setLoading(true);
        setError(null);
        socket.emit("fetch_full_account_map", (res: any) => {
            setLoading(false);
            if (res.status === "error") {
                setError(res.message);
            } else {
                setInfraData(res.data);
            }
        });
    }, [socket, isLive]);

    const handleFetchAiInsights = () => {
        if (!data) return;
        setShowAiInsights(true);
        setAiInsightsLoading(true);
        // Request AI analysis via socket
        socket?.emit('analyze_infrastructure_ai', {
            infraMap: data,
            accountId: data.liveAccountId,
            region: selectedRegion === 'global' ? data.nodes[0]?.region || 'us-east-1' : selectedRegion
        });
    };

    // Socket listeners
    React.useEffect(() => {
        if (!socket) return;

        socket.on("aws_infrastructure_update", (data) => {
            setInfraData(data);
        });

        socket.on("error", (error) => {
            setError(error.message);
            setAiInsightsLoading(false);
        });

        socket.on("analyze_infrastructure_ai_result", (result) => {
            setAiInsights(result.insights || []);
            setAiInsightsLoading(false);
        });

        return () => {
            socket.off("aws_infrastructure_update");
            socket.off("error");
            socket.off("analyze_infrastructure_ai_result");
        };
    }, [socket]);

    // EC2 lifecycle
    const handleAction = (action: "start" | "stop", nodeId: string, instanceId: string, region: string) => {
        if (!socket || !isLive) return;
        setActionLoading(nodeId);
        const event = action === "start" ? "start_ec2_node" : "stop_ec2_node";
        socket.emit(event, { instanceId, region }, (res: any) => {
            setActionLoading(null);
            if (res.status === "success") handleFetch(); // Refresh
        });
    };

    // Toggle helpers
    const toggleCategory = (cat: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            next.has(cat) ? next.delete(cat) : next.add(cat);
            return next;
        });
    };
    const toggleType = (type: string) => {
        setExpandedTypes(prev => {
            const next = new Set(prev);
            next.has(type) ? next.delete(type) : next.add(type);
            return next;
        });
    };

    // Grouped & filtered data
    const grouped = useMemo(() => {
        if (!data) return {};
        const lowerFilter = filter.toLowerCase();
        const filtered = lowerFilter
            ? data.nodes.filter(n => n.name.toLowerCase().includes(lowerFilter) || n.type.includes(lowerFilter) || n.region.includes(lowerFilter) || n.status.includes(lowerFilter))
            : data.nodes;
        const cats: Record<string, Record<string, InfraNode[]>> = {};
        for (const node of filtered) {
            if (!cats[node.category]) cats[node.category] = {};
            if (!cats[node.category][node.type]) cats[node.category][node.type] = [];
            cats[node.category][node.type].push(node);
        }
        return cats;
    }, [data, filter]);

    // Connections for selected node
    const connections = useMemo(() => {
        if (!selectedNode || !data) return [];
        return data.edges
            .filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
            .map(e => {
                const otherId = e.source === selectedNode.id ? e.target : e.source;
                const otherNode = data.nodes.find(n => n.id === otherId);
                return { edge: e, node: otherNode, direction: e.source === selectedNode.id ? "outgoing" : "incoming" };
            });
    }, [selectedNode, data]);

    return (
        <div className="flex h-full flex-col gap-5 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4 shrink-0">
                <div>
                    <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                        <Cloud className="h-5 w-5 text-sky-400" />
                        AWS Infrastructure Intelligence
                    </h2>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">
                        {isLive ? "Live Account — On-Demand Scan" : "Demo Simulation"}
                    </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-zinc-800/50">
                        <button
                            onClick={() => setViewMode("tree")}
                            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition", viewMode === "tree" ? "bg-zinc-800 text-zinc-200 shadow-sm" : "text-zinc-500 hover:text-zinc-300")}
                        >
                            <Boxes className="h-3 w-3" /> Outline
                        </button>
                        <button
                            onClick={() => setViewMode("graph")}
                            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition", viewMode === "graph" ? "bg-sky-500/20 text-sky-400 shadow-sm" : "text-zinc-500 hover:text-zinc-300")}
                        >
                            <GitMerge className="h-3 w-3" /> Visual Graph
                        </button>
                        <button
                            onClick={() => setViewMode("3d")}
                            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition", viewMode === "3d" ? "bg-violet-500/20 text-violet-400 shadow-sm" : "text-zinc-500 hover:text-zinc-300")}
                        >
                            <Box className="h-3 w-3" /> 3D View
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Region Selector */}
                    {rawData && (
                        <div className="flex items-center gap-2">
                            <Globe2 className="h-3.5 w-3.5 text-zinc-500" />
                            <select
                                value={selectedRegion}
                                onChange={e => {
                                    setSelectedRegion(e.target.value);
                                    setSelectedVpc("all"); // Reset VPC when region changes
                                }}
                                className="rounded-lg border border-zinc-800/50 bg-zinc-900/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300 outline-none focus:border-sky-500/50 cursor-pointer appearance-none pr-6"
                                style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.35rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.2em 1.2em' }}
                            >
                                <option value="global">🌐 Global (All Regions)</option>
                                {availableRegions.filter(r => r !== 'global').map(region => (
                                    <option key={region} value={region}>{region}</option>
                                ))}
                            </select>

                            {/* VPC Selector */}
                            <Network className="h-3.5 w-3.5 text-zinc-500 ml-2" />
                            <select
                                value={selectedVpc}
                                onChange={e => setSelectedVpc(e.target.value)}
                                className="rounded-lg border border-zinc-800/50 bg-zinc-900/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300 outline-none focus:border-purple-500/50 cursor-pointer appearance-none pr-6 max-w-[200px] truncate"
                                style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.35rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.2em 1.2em' }}
                            >
                                <option value="all">All VPCs</option>
                                {availableVpcs.map(vpc => (
                                    <option key={vpc.id} value={vpc.id}>{vpc.name} ({vpc.id})</option>
                                ))}
                            </select>
                        </div>
                    )}
                    {isLive && (
                        <button
                            onClick={handleFetch}
                            disabled={loading}
                            title="This action calls AWS APIs which may incur small usage charges depending on your AWS account."
                            className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-sky-400 hover:bg-sky-500/20 transition disabled:opacity-50 group relative"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            <span>{loading ? "Scanning…" : "Scan Account"}</span>
                            {!loading && (
                                <span className="ml-1 text-[9px] text-sky-300 opacity-80 backdrop-blur-sm bg-sky-950/50 px-1.5 py-0.5 rounded">
                                    {API_COST_MAP.scan_account}
                                </span>
                            )}
                        </button>
                    )}
                    {data && (
                        <>
                            <button
                                onClick={() => setShowCostPanel(!showCostPanel)}
                                title="This action calls AWS APIs which may incur small usage charges depending on your AWS account."
                                className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition group relative",
                                    showCostPanel
                                        ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-400"
                                        : "border-zinc-700/50 bg-zinc-800/50 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30"
                                )}
                            >
                                <DollarSign className="h-3 w-3" />
                                <span>Cost</span>
                                <span className={cn("ml-1 text-[8px] px-1 py-0.5 rounded", showCostPanel ? "bg-emerald-950/60 text-emerald-300" : "bg-zinc-700 text-zinc-400 group-hover:bg-emerald-950 group-hover:text-emerald-300")}>
                                    {API_COST_MAP.estimate_costs}
                                </span>
                            </button>
                            <button
                                onClick={() => setShowVpcCostPanel(!showVpcCostPanel)}
                                className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition group relative",
                                    showVpcCostPanel
                                        ? "border-sky-500/40 bg-sky-500/20 text-sky-400"
                                        : "border-zinc-700/50 bg-zinc-800/50 text-zinc-400 hover:text-sky-400 hover:border-sky-500/30"
                                )}
                            >
                                <Layers className="h-3 w-3" />
                                <span>VPC Cost</span>
                                <span className={cn("ml-1 text-[8px] px-1 py-0.5 rounded", showVpcCostPanel ? "bg-sky-950/60 text-sky-300" : "bg-zinc-700 text-zinc-400 group-hover:bg-sky-950 group-hover:text-sky-300")}>
                                    FREE
                                </span>
                            </button>
                            <button
                                onClick={() => setShowTfExport(true)}
                                title="This action calls AWS APIs which may incur small usage charges depending on your AWS account."
                                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:text-violet-400 hover:border-violet-500/30 transition group relative"
                            >
                                <FileCode className="h-3 w-3" />
                                <span>Terraform</span>
                                <span className="ml-1 text-[8px] px-1 py-0.5 rounded bg-zinc-700 text-zinc-400 group-hover:bg-violet-950 group-hover:text-violet-300">
                                    {API_COST_MAP.terraform_export}
                                </span>
                            </button>
                            <button
                                onClick={handleFetchAiInsights}
                                title="This action calls AWS APIs which may incur small usage charges depending on your AWS account."
                                className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition group relative",
                                    showAiInsights
                                        ? "border-violet-500/40 bg-violet-500/20 text-violet-400"
                                        : "border-zinc-700/50 bg-zinc-800/50 text-zinc-400 hover:text-violet-400 hover:border-violet-500/30"
                                )}
                            >
                                <Sparkles className="h-3 w-3" />
                                <span>AI Analyst</span>
                                <span className={cn("ml-1 text-[8px] px-1 py-0.5 rounded", showAiInsights ? "bg-violet-950/60 text-violet-300" : "bg-zinc-700 text-zinc-400 group-hover:bg-violet-950 group-hover:text-violet-300")}>
                                    $0.005
                                </span>
                            </button>
                        </>
                    )}
                    {!isLive && (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold text-amber-400 uppercase tracking-widest">
                            Demo Mode
                        </span>
                    )}
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
                    <AlertTriangle className="h-3 w-3 inline mr-1" /> {error}
                </div>
            )}

            {/* Summary Bar */}
            {data && (
                <div className="grid grid-cols-3 gap-3 md:grid-cols-6 shrink-0">
                    <MiniStat label="Total" value={data.summary.totalResources} color="text-zinc-100" />
                    <MiniStat label="Active" value={data.summary.activeCount} color="text-emerald-400" />
                    <MiniStat label="Stopped" value={data.summary.stoppedCount} color="text-zinc-500" />
                    <MiniStat label="Orphan" value={data.summary.orphanCount} color="text-red-400" />
                    <MiniStat label="Idle" value={data.summary.idleCount} color="text-blue-400" />
                    <MiniStat label="Regions" value={data.summary.regionCount} color="text-purple-400" />
                </div>
            )}

            {/* Search */}
            {data && (
                <div className="relative shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                    <input
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        placeholder="Filter resources by name, type, region, status…"
                        className="w-full rounded-lg border border-zinc-800/50 bg-zinc-900/50 py-2 pl-9 pr-3 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-sky-500/50"
                    />
                </div>
            )}

            {/* Main Content Grid */}
            {data && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0 min-h-[600px]">
                    {/* View Area (2 cols) */}
                    <div
                        ref={containerRef}
                        className={cn(
                            "transition-all duration-300 relative",
                            isFullscreen
                                ? "fixed inset-0 z-50 bg-zinc-950 p-4 w-screen h-screen flex flex-col overflow-hidden"
                                : "lg:col-span-2"
                        )}
                    >
                        {/* Fullscreen Toggle */}
                        <div className={cn("absolute z-50", isFullscreen ? "top-6 right-6" : "top-3 right-3")}>
                            {/* We push it down slightly if it's the 3d mode inside the normal view so we don't block the 3D badge */}
                            <button
                                onClick={toggleFullscreen}
                                className={cn(
                                    "p-2 rounded-lg backdrop-blur shadow-lg border transition",
                                    viewMode === '3d' && !isFullscreen ? "mt-10 bg-zinc-900/60 border-zinc-700 text-zinc-400 hover:text-zinc-200" : "bg-zinc-900/80 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                                )}
                                title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                            >
                                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                            </button>
                        </div>

                        {data.nodes.length === 0 ? (
                            <div className={cn("rounded-xl border border-dashed border-zinc-800/80 bg-zinc-900/20 p-8 flex flex-col items-center justify-center text-center", isFullscreen ? "flex-1" : "h-full min-h-[400px]")}>
                                <Network className="h-12 w-12 text-zinc-600 mb-4" />
                                <h3 className="text-lg font-semibold text-zinc-300">No resources found</h3>
                                <p className="text-zinc-500 mt-2 max-w-sm">
                                    The selected VPC does not contain any discovered resources in the current region.
                                </p>
                            </div>
                        ) : viewMode === "tree" ? (
                            <div className={cn("rounded-xl border border-zinc-800/50 bg-zinc-900/20 p-4 overflow-y-auto", isFullscreen ? "flex-1" : "h-full max-h-[70vh]")}>
                                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4 flex items-center gap-2">
                                    <Boxes className="h-3.5 w-3.5" /> Hierarchical Resource View
                                </h3>
                                {Object.entries(grouped).map(([category, types]) => (
                                    <div key={category} className="mb-3">
                                        <button
                                            onClick={() => toggleCategory(category)}
                                            className="flex items-center gap-2 w-full text-left py-2 px-2 rounded-lg hover:bg-zinc-800/30 transition"
                                        >
                                            {expandedCategories.has(category)
                                                ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                                                : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
                                            }
                                            <span className="text-xs font-bold uppercase tracking-widest text-sky-400">{CATEGORY_LABEL[category] || category}</span>
                                            <span className="text-[9px] text-zinc-600 ml-auto">
                                                {Object.values(types).reduce((s, arr) => s + arr.length, 0)} resources
                                            </span>
                                        </button>

                                        {expandedCategories.has(category) && (
                                            <div className="pl-4 border-l border-zinc-800/50 ml-2 mt-1 space-y-2">
                                                {Object.entries(types).map(([type, resources]) => {
                                                    const TypeIcon = TYPE_ICON[type] || Boxes;
                                                    return (
                                                        <div key={type}>
                                                            <button
                                                                onClick={() => toggleType(type)}
                                                                className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded hover:bg-zinc-800/20 transition"
                                                            >
                                                                {expandedTypes.has(type)
                                                                    ? <ChevronDown className="h-3 w-3 text-zinc-600" />
                                                                    : <ChevronRight className="h-3 w-3 text-zinc-600" />
                                                                }
                                                                <TypeIcon className="h-3.5 w-3.5 text-zinc-400" />
                                                                <span className="text-[11px] font-semibold text-zinc-300">{TYPE_LABEL[type] || type}</span>
                                                                <span className="text-[9px] text-zinc-600 ml-auto">{resources.length}</span>
                                                            </button>

                                                            {expandedTypes.has(type) && (
                                                                <div className="pl-6 mt-1 space-y-1">
                                                                    {resources.map(node => (
                                                                        <button
                                                                            key={node.id}
                                                                            onClick={() => setSelectedNode(node)}
                                                                            className={cn(
                                                                                "flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg border transition text-xs",
                                                                                selectedNode?.id === node.id
                                                                                    ? "border-sky-500/40 bg-sky-500/10"
                                                                                    : "border-zinc-800/30 bg-zinc-900/30 hover:bg-zinc-800/30"
                                                                            )}
                                                                        >
                                                                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_CONFIG[node.status]?.color.replace("text-", "bg-"))} />
                                                                            <span className="text-zinc-200 font-medium truncate flex-1">{node.name}</span>
                                                                            <span className="text-[9px] text-zinc-600 shrink-0">{node.region}</span>
                                                                            <StatusBadge status={node.status} />
                                                                            {/* Inline action buttons for EC2 */}
                                                                            {node.type === "ec2" && isLive && node.status === "active" && (
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); handleAction("stop", node.id, node.instanceId || node.id, node.region); }}
                                                                                    disabled={actionLoading === node.id}
                                                                                    className="ml-1 p-1 rounded border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition group relative"
                                                                                    title={`Stop Instance (${API_COST_MAP.stop_instance}. API call may incur minor usage charge)`}
                                                                                >
                                                                                    {actionLoading === node.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Square className="h-2.5 w-2.5" />}
                                                                                </button>
                                                                            )}
                                                                            {node.type === "ec2" && isLive && node.status === "stopped" && (
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); handleAction("start", node.id, node.instanceId || node.id, node.region); }}
                                                                                    disabled={actionLoading === node.id}
                                                                                    className="ml-1 p-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition group relative"
                                                                                    title={`Start Instance (${API_COST_MAP.start_instance}. API call may incur minor usage charge)`}
                                                                                >
                                                                                    {actionLoading === node.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Play className="h-2.5 w-2.5" />}
                                                                                </button>
                                                                            )}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : viewMode === "graph" ? (
                            <ArchitectureGraph data={data} selectedNodeId={selectedNode?.id || null} onSelect={setSelectedNode} />
                        ) : (
                            <Isometric3DView data={data} />
                        )}
                    </div>

                    {/* Detail Panel (1 col) */}
                    <div className="flex flex-col rounded-xl border border-zinc-800/50 bg-zinc-900/20 max-h-[70vh]">
                        <div className="p-4 border-b border-zinc-800/50 shrink-0">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Resource Details</h3>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1 min-h-0">
                            {selectedNode ? (
                                <div className="space-y-4">
                                    {/* Header */}
                                    <div className="flex items-center gap-2">
                                        {React.createElement(TYPE_ICON[selectedNode.type] || Boxes, { className: "h-5 w-5 text-sky-400" })}
                                        <div>
                                            <div className="text-sm font-bold text-zinc-100">{selectedNode.name}</div>
                                            <div className="text-[10px] text-zinc-500 uppercase tracking-widest">{TYPE_LABEL[selectedNode.type]}</div>
                                        </div>
                                    </div>
                                    <StatusBadge status={selectedNode.status} />

                                    {/* Meta table */}
                                    <div className="space-y-1">
                                        <DetailRow label="Region" value={selectedNode.region} />
                                        <DetailRow label="Category" value={CATEGORY_LABEL[selectedNode.category] || selectedNode.category} />
                                        {Object.entries(selectedNode.meta).map(([key, value]) => (
                                            <DetailRow key={key} label={key} value={String(value ?? "—")} />
                                        ))}
                                    </div>

                                    {/* Connections */}
                                    {connections.length > 0 && (
                                        <div>
                                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 mt-4">Connections ({connections.length})</h4>
                                            <div className="space-y-1">
                                                {connections.map((conn, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => conn.node && setSelectedNode(conn.node)}
                                                        className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded border border-zinc-800/30 hover:bg-zinc-800/20 transition text-[11px]"
                                                    >
                                                        <span className={cn("text-[9px] uppercase tracking-widest font-bold w-8", conn.direction === "outgoing" ? "text-sky-500" : "text-purple-500")}>
                                                            {conn.direction === "outgoing" ? "→" : "←"}
                                                        </span>
                                                        <span className="text-zinc-400 truncate flex-1">{conn.node?.name || conn.edge.target}</span>
                                                        <span className="text-[9px] text-zinc-600">{conn.edge.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    {selectedNode.type === "ec2" && isLive && (
                                        <div className="pt-3 border-t border-zinc-800/50 flex gap-2">
                                            {selectedNode.status === "active" && (
                                                <button
                                                    onClick={() => handleAction("stop", selectedNode.id, selectedNode.instanceId || selectedNode.id, selectedNode.region)}
                                                    disabled={actionLoading === selectedNode.id}
                                                    title={`This action calls AWS APIs which may incur small usage charges (${API_COST_MAP.stop_instance}).`}
                                                    className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/20 transition disabled:opacity-40"
                                                >
                                                    {actionLoading === selectedNode.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
                                                    <span>Stop Instance</span>
                                                    <span className="ml-1 text-[8px] bg-red-950/60 text-red-300 px-1 py-0.5 rounded">{API_COST_MAP.stop_instance}</span>
                                                </button>
                                            )}
                                            {selectedNode.status === "stopped" && (
                                                <button
                                                    onClick={() => handleAction("start", selectedNode.id, selectedNode.instanceId || selectedNode.id, selectedNode.region)}
                                                    disabled={actionLoading === selectedNode.id}
                                                    title={`This action calls AWS APIs which may incur small usage charges (${API_COST_MAP.start_instance}).`}
                                                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-40"
                                                >
                                                    {actionLoading === selectedNode.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                                    <span>Start Instance</span>
                                                    <span className="ml-1 text-[8px] bg-emerald-950/60 text-emerald-300 px-1 py-0.5 rounded">{API_COST_MAP.start_instance}</span>
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-48 text-zinc-600">
                                    <Boxes className="h-8 w-8 mb-2 opacity-50" />
                                    <p className="text-xs uppercase tracking-widest">Select a resource</p>
                                    <p className="text-[10px] text-zinc-700 mt-1">Click any item in the tree</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Cost Estimation Panel */}
            {data && showCostPanel && (
                <CostEstimationPanel infraData={data} onClose={() => setShowCostPanel(false)} />
            )}

            {/* VPC Cost Estimation Panel */}
            {data && showVpcCostPanel && (
                <VpcCostEstimationPanel infraData={data} onClose={() => setShowVpcCostPanel(false)} />
            )}

            {/* Terraform Export Modal */}
            {data && showTfExport && (
                <TerraformExportModal infraData={data} onClose={() => setShowTfExport(false)} />
            )}

            {/* AI Insights Panel */}
            {data && showAiInsights && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm shadow-2xl">
                    <div className="w-full max-w-4xl max-h-[90vh] flex flex-col">
                        <AiInsightsPanel
                            insights={aiInsights}
                            loading={aiInsightsLoading}
                            onClose={() => setShowAiInsights(false)}
                            onInsightClick={(insight) => {
                                // If affected resources exist, highlight the first one in the graph/tree
                                if (insight.affectedResources && insight.affectedResources.length > 0) {
                                    const targetNode = data.nodes.find(n => n.id === insight.affectedResources[0] || (n as any).instanceId === insight.affectedResources[0]);
                                    if (targetNode) {
                                        setSelectedNode(targetNode);
                                        if (viewMode === '3d') setViewMode('graph'); // Bring to 2D for easier selection view
                                        setShowAiInsights(false); // Close panel to show graph
                                    }
                                }
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Empty state for live mode */}
            {!data && isLive && !loading && (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 border border-dashed border-zinc-800/50 rounded-xl py-16">
                    <Cloud className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-sm font-semibold uppercase tracking-wider">No Data Loaded</p>
                    <p className="text-xs text-zinc-700 mt-1 mb-4">Click "Scan Account" to discover your infrastructure</p>
                    <button
                        onClick={handleFetch}
                        title="This action calls AWS APIs which may incur small usage charges depending on your AWS account."
                        className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-sky-400 hover:bg-sky-500/20 transition"
                    >
                        <RefreshCw className="h-4 w-4" />
                        <span>Scan Account</span>
                        <span className="ml-1 text-[9px] text-sky-300 opacity-80 backdrop-blur-sm bg-sky-950/50 px-1.5 py-0.5 rounded">
                            {API_COST_MAP.scan_account}
                        </span>
                    </button>
                </div>
            )}
        </div>
    );
}

// ── Helper Components ─────────────────────────────────────────────────────
function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 px-3 py-2 text-center">
            <div className={cn("text-xl font-mono font-bold", color)}>{value}</div>
            <div className="text-[9px] text-zinc-600 uppercase tracking-widest">{label}</div>
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between items-center py-1 border-b border-zinc-800/20 text-[11px]">
            <span className="text-zinc-500 uppercase tracking-wider text-[9px] font-medium">{label}</span>
            <span className="text-zinc-300 font-mono truncate max-w-[180px]" title={value}>{value}</span>
        </div>
    );
}
