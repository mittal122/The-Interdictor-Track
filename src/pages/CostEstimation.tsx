import React, { useState, useMemo, useEffect, useCallback } from "react";
import { DollarSign, Network, Layers, ChevronDown, ChevronRight, Loader2, AlertTriangle, Lightbulb, TrendingDown, Globe, Server, Zap, HardDrive, Database, Shield, Radio } from "lucide-react";
import { RefreshButton } from "../components/RefreshButton";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "../utils/cn";
import { useSocket } from "../contexts/SocketContext";
import { useAppMode } from "../contexts/AppModeContext";

const COLORS = ["#0ea5e9","#a855f7","#f97316","#22c55e","#ef4444","#eab308","#ec4899","#14b8a6","#6366f1","#f43f5e"];

const OPTIMIZATION_TIPS: Record<string, { tip: string; savings: string }[]> = {
  EC2: [
    { tip: "Use Reserved Instances or Savings Plans for steady-state workloads — up to 72% savings", savings: "40-72%" },
    { tip: "Switch to Graviton (ARM) instances (t4g, m7g) for 20% better price-performance", savings: "~20%" },
    { tip: "Enable Auto Scaling to match capacity with demand and avoid idle instances", savings: "10-40%" },
    { tip: "Use Spot Instances for fault-tolerant batch/CI workloads", savings: "60-90%" },
  ],
  RDS: [
    { tip: "Use Reserved DB Instances for production databases", savings: "30-60%" },
    { tip: "Consider Aurora Serverless v2 for variable workloads — pay per ACU", savings: "20-50%" },
    { tip: "Right-size instances based on CloudWatch CPU/memory metrics", savings: "15-40%" },
  ],
  EBS: [
    { tip: "Delete unattached (orphaned) volumes immediately", savings: "100%" },
    { tip: "Switch from io2 to gp3 for general workloads — same perf, lower cost", savings: "20-30%" },
    { tip: "Use EBS Snapshots + lifecycle policies instead of keeping old volumes", savings: "50-80%" },
  ],
  NAT: [
    { tip: "Use VPC endpoints (Gateway type) for S3/DynamoDB to bypass NAT", savings: "30-60%" },
    { tip: "Consider NAT instances on t3.nano for low-traffic VPCs", savings: "50-70%" },
    { tip: "Route traffic through a single NAT and share across AZs if latency allows", savings: "50%" },
  ],
  ELB: [
    { tip: "Remove idle load balancers with no healthy targets", savings: "100%" },
    { tip: "Consolidate multiple ALBs using path-based routing rules", savings: "30-50%" },
    { tip: "Use CloudFront + S3 for static content instead of routing through ALB", savings: "20-40%" },
  ],
  LAMBDA: [
    { tip: "Right-size memory allocation using AWS Lambda Power Tuning", savings: "10-40%" },
    { tip: "Use Provisioned Concurrency only when cold starts are critical", savings: "20-50%" },
    { tip: "Batch small invocations using SQS to reduce total invocation count", savings: "30-60%" },
  ],
  S3: [
    { tip: "Enable S3 Intelligent-Tiering for automatic cost optimization", savings: "20-40%" },
    { tip: "Set lifecycle rules to move old data to Glacier/Deep Archive", savings: "60-90%" },
    { tip: "Enable S3 Storage Lens to identify unused or oversized buckets", savings: "10-30%" },
  ],
  EIP: [
    { tip: "Release unassociated Elastic IPs — AWS charges $3.65/mo per unused EIP", savings: "100%" },
    { tip: "Use dynamic DNS or ALB instead of multiple EIPs", savings: "100%" },
  ],
};

const SVC_ICON: Record<string, React.ComponentType<{className?:string}>> = {
  EC2: Server, RDS: Database, EBS: HardDrive, S3: Database, LAMBDA: Zap,
  NAT: Radio, ELB: Zap, EIP: Globe, SG: Shield,
};

const CTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (<div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
    <div className="text-zinc-300 font-semibold">{payload[0].name||payload[0].payload?.service||payload[0].payload?.vpcName}</div>
    <div className="text-emerald-400 font-mono">${payload[0].value?.toFixed(2)}/mo</div>
  </div>);
};

// ── Service Card with optimization tips ──
function ServiceCard({ svc, total, expanded, onToggle }: { svc: {service:string;cost:number;count:number}; total: number; expanded: boolean; onToggle:()=>void }) {
  const pct = total > 0 ? ((svc.cost / total) * 100).toFixed(1) : "0";
  const Icon = SVC_ICON[svc.service] || Layers;
  const tips = OPTIMIZATION_TIPS[svc.service] || [{ tip: "Review usage patterns and consider consolidation", savings: "Varies" }];
  const color = COLORS[Object.keys(SVC_ICON).indexOf(svc.service) % COLORS.length];

  return (
    <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/30 transition group">
        <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{backgroundColor:`${color}15`,border:`1px solid ${color}40`}}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-zinc-200">{svc.service}</span>
            <span className="text-[9px] text-zinc-600">×{svc.count} resources</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-1.5">
            <div className="h-1.5 rounded-full transition-all duration-500" style={{width:`${pct}%`,backgroundColor:color}} />
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-mono font-bold" style={{color}}>${svc.cost.toFixed(2)}</div>
          <div className="text-[9px] text-zinc-500">{pct}% of total</div>
        </div>
        <div className="text-zinc-600 group-hover:text-zinc-400 ml-1">{expanded?<ChevronDown className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>}</div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-800/40 px-4 py-3 bg-zinc-950/30 space-y-2">
          <h5 className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5 mb-2"><Lightbulb className="h-3 w-3"/>Optimization Suggestions</h5>
          {tips.map((t,i) => (
            <div key={i} className="flex gap-3 py-2 px-3 rounded-lg bg-zinc-900/50 border border-zinc-800/30">
              <TrendingDown className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5"/>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-zinc-300 leading-relaxed">{t.tip}</p>
                <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">Potential Savings: {t.savings}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── VPC Group Card ──
function VpcGroupCard({ group, idx, expanded, onToggle }: { group: any; idx: number; expanded: boolean; onToggle:()=>void }) {
  const color = COLORS[idx % COLORS.length];
  const isGlobal = group.vpcId === "unattached";
  return (
    <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/30 transition group">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{backgroundColor:`${color}15`,border:`1px solid ${color}40`}}>
          {isGlobal ? <Globe className="h-4 w-4" style={{color}}/> : <Network className="h-4 w-4" style={{color}}/>}
        </div>
        <div className="flex-1 text-left">
          <span className="text-xs font-bold text-zinc-200">{group.vpcName}</span>
          <div className="text-[9px] text-zinc-500 mt-0.5">{group.resourceCount} resources · {group.region}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-base font-mono font-bold" style={{color}}>${group.totalMonthly.toFixed(2)}</div>
          {group.wastedCost > 0 && <div className="text-[9px] text-red-400">${group.wastedCost.toFixed(2)} wasted</div>}
        </div>
        <div className="text-zinc-600 group-hover:text-zinc-400 ml-1">{expanded?<ChevronDown className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>}</div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-800/40 px-4 py-3 bg-zinc-950/30 space-y-1.5">
          {group.resources.map((r:any) => (
            <div key={r.id} className={cn("flex items-center justify-between text-[11px] py-1.5 px-3 rounded",r.isWasted?"bg-red-950/20 border border-red-900/30":"bg-zinc-900/50")}>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={cn("w-1.5 h-1.5 rounded-full",r.isWasted?"bg-red-400":"bg-emerald-400")}/>
                <span className="text-zinc-300 truncate">{r.name}</span>
                <span className="text-[9px] text-zinc-600 uppercase">{r.type}</span>
              </div>
              <span className={cn("font-mono font-semibold shrink-0",r.isWasted?"text-red-400":"text-zinc-200")}>${r.monthlyEstimate.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──
export function CostEstimation() {
  const { socket } = useSocket();
  const { mode } = useAppMode();
  const [tab, setTab] = useState<"service"|"vpc"|"resource">("service");
  const [costData, setCostData] = useState<any>(null);
  const [vpcData, setVpcData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSvc, setExpandedSvc] = useState<Set<string>>(new Set());
  const [expandedVpc, setExpandedVpc] = useState<Set<string>>(new Set());

  // Extracted fetch logic for mount + refresh button
  const fetchCostData = useCallback(() => {
    if (!socket) return;
    setLoading(true);
    socket.emit("fetch_full_account_map", (res: any) => {
      const infraData = res.status === "success" ? res.data : null;
      if (!infraData) { setLoading(false); return; }
      let done = 0;
      socket.emit("estimate_costs", { infraData }, (r: any) => { if (r.status==="success") setCostData(r.data); done++; if(done>=2) setLoading(false); });
      socket.emit("estimate_costs_by_vpc", { infraData }, (r: any) => { if (r.status==="success") { setVpcData(r.data); setExpandedVpc(new Set([r.data.vpcGroups[0]?.vpcId].filter(Boolean))); } done++; if(done>=2) setLoading(false); });
    });
  }, [socket]);

  // Fetch on mount
  useEffect(() => {
    fetchCostData();
  }, [fetchCostData]);

  const toggleSvc = (s:string) => setExpandedSvc(p=>{const n=new Set(p);n.has(s)?n.delete(s):n.add(s);return n;});
  const toggleVpc = (s:string) => setExpandedVpc(p=>{const n=new Set(p);n.has(s)?n.delete(s):n.add(s);return n;});

  const totalSavings = useMemo(() => {
    if (!costData) return 0;
    return costData.wastedCost + costData.totalMonthly * 0.25; // wasted + ~25% optimization potential
  }, [costData]);

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/50 pb-4 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2"><DollarSign className="h-5 w-5 text-emerald-400"/>Cost Estimation & Optimization</h2>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Multi-level cost analysis with AI-powered savings recommendations</p>
        </div>
        <div className="flex items-center gap-3">
          {mode === "demo" && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold text-amber-400 uppercase tracking-widest">Demo Mode</span>}
          <RefreshButton onRefresh={fetchCostData} />
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center"><div className="flex flex-col items-center gap-3"><Loader2 className="h-10 w-10 text-emerald-400 animate-spin"/><span className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Analyzing infrastructure costs…</span></div></div>
      ) : !costData ? (
        <div className="flex-1 flex items-center justify-center text-zinc-600"><div className="text-center"><DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30"/><p className="text-sm uppercase tracking-widest">No cost data available</p><p className="text-xs text-zinc-700 mt-1">Activate Live Mode or wait for demo data</p></div></div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-center">
              <div className="text-2xl font-mono font-bold text-emerald-400">${costData.totalMonthly.toFixed(2)}</div>
              <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1">Monthly Total</div>
            </div>
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-center">
              <div className="text-2xl font-mono font-bold text-sky-400">${(costData.totalMonthly*12).toFixed(0)}</div>
              <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1">Annual Estimate</div>
            </div>
            <div className={cn("rounded-xl border px-4 py-3 text-center",costData.wastedCost>0?"border-red-500/20 bg-red-500/5":"border-zinc-800/50 bg-zinc-900/30")}>
              <div className={cn("text-2xl font-mono font-bold",costData.wastedCost>0?"text-red-400":"text-zinc-500")}>${costData.wastedCost.toFixed(2)}</div>
              <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1">Wasted Spend</div>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-center">
              <div className="text-2xl font-mono font-bold text-amber-400">~${totalSavings.toFixed(0)}</div>
              <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1">Potential Savings</div>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-zinc-800/50 shrink-0 w-fit">
            {([["service","By Service"],["vpc","By VPC"],["resource","By Resource"]] as const).map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)} className={cn("px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition",tab===k?"bg-zinc-800 text-zinc-200 shadow-sm":"text-zinc-500 hover:text-zinc-300")}>{l}</button>
            ))}
          </div>

          {/* Tab Content */}
          {tab === "service" && (
            <div className="space-y-3">
              {/* Charts */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Cost Distribution</h4>
                  <div className="h-[180px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={costData.byService} dataKey="cost" nameKey="service" cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={2} strokeWidth={0}>{costData.byService.map((_:any,i:number)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip content={<CTooltip/>}/></PieChart></ResponsiveContainer></div>
                </div>
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Top Cost Drivers</h4>
                  <div className="h-[180px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={costData.topDrivers.slice(0,5)} layout="vertical" margin={{left:60,right:10,top:5,bottom:5}}><XAxis type="number" tick={{fill:'#71717a',fontSize:9}} tickFormatter={(v:number)=>`$${v}`}/><YAxis type="category" dataKey="name" tick={{fill:'#a1a1aa',fontSize:9}} width={55}/><Tooltip content={<CTooltip/>}/><Bar dataKey="monthlyEstimate" radius={[0,4,4,0]}>{costData.topDrivers.slice(0,5).map((_:any,i:number)=><Cell key={i} fill={COLORS[i]}/>)}</Bar></BarChart></ResponsiveContainer></div>
                </div>
              </div>
              {/* Service Cards with Tips */}
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2 pt-2"><Lightbulb className="h-3.5 w-3.5 text-amber-400"/>Per-Service Breakdown & Optimization</h3>
              {costData.byService.map((svc:any) => (
                <ServiceCard key={svc.service} svc={svc} total={costData.totalMonthly} expanded={expandedSvc.has(svc.service)} onToggle={()=>toggleSvc(svc.service)}/>
              ))}
            </div>
          )}

          {tab === "vpc" && vpcData && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-center">
                  <div className="text-xl font-mono font-bold text-sky-400">{vpcData.vpcGroups.length}</div>
                  <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1">Active VPCs</div>
                </div>
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-center">
                  <div className="text-xl font-mono font-bold text-violet-400">${vpcData.grandTotalMonthly.toFixed(2)}</div>
                  <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1">Total Across VPCs</div>
                </div>
                <div className={cn("rounded-xl border px-4 py-3 text-center",vpcData.grandWastedCost>0?"border-red-500/20 bg-red-500/5":"border-zinc-800/50 bg-zinc-900/30")}>
                  <div className={cn("text-xl font-mono font-bold",vpcData.grandWastedCost>0?"text-red-400":"text-zinc-500")}>${vpcData.grandWastedCost.toFixed(2)}</div>
                  <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1">VPC Waste</div>
                </div>
              </div>
              {vpcData.vpcGroups.map((g:any,i:number)=><VpcGroupCard key={g.vpcId} group={g} idx={i} expanded={expandedVpc.has(g.vpcId)} onToggle={()=>toggleVpc(g.vpcId)}/>)}
              {vpcData.unattachedResources.resourceCount>0 && <VpcGroupCard group={vpcData.unattachedResources} idx={vpcData.vpcGroups.length} expanded={expandedVpc.has("unattached")} onToggle={()=>toggleVpc("unattached")}/>}
            </div>
          )}

          {tab === "resource" && (
            <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50"><h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">All Resources — Sorted by Cost</h4></div>
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-zinc-800/30">
                {costData.byResource.filter((r:any)=>r.monthlyEstimate>0).sort((a:any,b:any)=>b.monthlyEstimate-a.monthlyEstimate).map((r:any)=>(
                  <div key={r.id} className={cn("flex items-center justify-between px-4 py-2.5 text-xs hover:bg-zinc-800/20 transition",r.isWasted&&"bg-red-950/10")}>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className={cn("w-2 h-2 rounded-full shrink-0",r.isWasted?"bg-red-400":"bg-emerald-400")}/>
                      <div className="min-w-0">
                        <div className="text-zinc-200 font-medium truncate">{r.name}</div>
                        <div className="text-[9px] text-zinc-500">{r.type.toUpperCase()} · {r.region} · {r.details}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <div className={cn("font-mono font-bold",r.isWasted?"text-red-400":"text-zinc-200")}>${r.monthlyEstimate.toFixed(2)}/mo</div>
                      {r.isWasted && <div className="text-[9px] text-red-400">{r.wasteReason}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Global Tips */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 shrink-0">
            <h4 className="text-xs font-bold uppercase tracking-widest text-amber-400 flex items-center gap-2 mb-3"><Lightbulb className="h-4 w-4"/>General Optimization Strategy</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[{title:"Right-Sizing",desc:"Analyze CloudWatch metrics to downsize over-provisioned instances. Use AWS Compute Optimizer for data-driven recommendations.",save:"15-40%"},
                {title:"Reserved Capacity",desc:"Commit to 1-3 year Reserved Instances or Savings Plans for predictable workloads to unlock massive discounts.",save:"40-72%"},
                {title:"Architectural Review",desc:"Replace NAT Gateways with VPC endpoints, consolidate ALBs, and use serverless (Lambda/Fargate) where possible.",save:"20-50%"}
              ].map((t,i)=>(
                <div key={i} className="rounded-lg border border-zinc-800/40 bg-zinc-900/30 p-3">
                  <div className="text-[11px] font-bold text-zinc-200 mb-1">{t.title}</div>
                  <p className="text-[10px] text-zinc-400 leading-relaxed">{t.desc}</p>
                  <span className="inline-block mt-2 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">{t.save} savings</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-[9px] text-zinc-600 text-center shrink-0 pb-4">{costData.disclaimer}</div>
        </>
      )}
    </div>
  );
}
