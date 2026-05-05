/**
 * AWS Infrastructure Cost Estimation Service
 * 
 * Estimates monthly costs based on resource types and configurations.
 * Uses approximate on-demand pricing (us-east-1) as baseline.
 */

// ── Types ─────────────────────────────────────────────────────────────────
interface InfraNode {
    id: string;
    type: string;
    category: string;
    name: string;
    region: string;
    status: string;
    meta: Record<string, any>;
}

interface InfraMap {
    nodes: InfraNode[];
    edges: { source: string; target: string; label: string }[];
    summary: any;
    fetchedAt: number;
}

interface ResourceCost {
    id: string;
    name: string;
    type: string;
    region: string;
    monthlyEstimate: number;
    hourlyCost: number;
    details: string;
    isWasted: boolean;
    wasteReason?: string;
}

interface CostEstimation {
    totalMonthly: number;
    byService: { service: string; cost: number; count: number }[];
    byRegion: { region: string; cost: number; count: number }[];
    byResource: ResourceCost[];
    topDrivers: ResourceCost[];
    wastedCost: number;
    wastedResources: ResourceCost[];
    currency: string;
    disclaimer: string;
}

// ── Pricing Tables (approximate US-East-1 on-demand) ──────────────────────
const EC2_PRICING: Record<string, number> = {
    't2.nano': 0.0058, 't2.micro': 0.0116, 't2.small': 0.023, 't2.medium': 0.0464,
    't2.large': 0.0928, 't2.xlarge': 0.1856, 't2.2xlarge': 0.3712,
    't3.nano': 0.0052, 't3.micro': 0.0104, 't3.small': 0.0208, 't3.medium': 0.0416,
    't3.large': 0.0832, 't3.xlarge': 0.1664, 't3.2xlarge': 0.3328,
    't3a.nano': 0.0047, 't3a.micro': 0.0094, 't3a.small': 0.0188, 't3a.medium': 0.0376,
    't3a.large': 0.0752, 't3a.xlarge': 0.1504,
    'm5.large': 0.096, 'm5.xlarge': 0.192, 'm5.2xlarge': 0.384, 'm5.4xlarge': 0.768,
    'm6i.large': 0.096, 'm6i.xlarge': 0.192,
    'c5.large': 0.085, 'c5.xlarge': 0.17, 'c5.2xlarge': 0.34,
    'r5.large': 0.126, 'r5.xlarge': 0.252, 'r5.2xlarge': 0.504,
};

const RDS_PRICING: Record<string, number> = {
    'db.t3.micro': 0.017, 'db.t3.small': 0.034, 'db.t3.medium': 0.068,
    'db.t3.large': 0.136, 'db.t3.xlarge': 0.272,
    'db.r5.large': 0.24, 'db.r5.xlarge': 0.48, 'db.r5.2xlarge': 0.96,
    'db.m5.large': 0.171, 'db.m5.xlarge': 0.342,
};

const FIXED_HOURLY: Record<string, number> = {
    nat: 0.045,   // NAT Gateway
    elb: 0.0225,  // ALB
    eip: 0.005,   // Unused EIP
    igw: 0.0,     // Free
    rt: 0.0,     // Free
    sg: 0.0,     // Free
};

const EBS_PER_GB_MONTH = 0.10;  // gp2/gp3
const S3_PER_GB_MONTH = 0.023;  // S3 Standard
const LAMBDA_PER_MILLION_REQUESTS = 0.20;
const LAMBDA_EST_MONTHLY_INVOCATIONS = 100_000;
const HOURS_PER_MONTH = 730;

// ── Cost Calculator ───────────────────────────────────────────────────────
function estimateResourceCost(node: InfraNode): ResourceCost {
    let hourlyCost = 0;
    let monthlyEstimate = 0;
    let details = '';
    let isWasted = false;
    let wasteReason: string | undefined;

    switch (node.type) {
        case 'ec2': {
            const instanceType = node.meta?.instanceType || 't3.medium';
            hourlyCost = EC2_PRICING[instanceType] || 0.0416;
            if (node.status === 'stopped') {
                monthlyEstimate = 0; // Stopped instances don't incur compute cost
                details = `${instanceType} (stopped — no compute cost)`;
            } else {
                monthlyEstimate = hourlyCost * HOURS_PER_MONTH;
                details = `${instanceType} on-demand`;
            }
            if (node.status === 'idle') {
                isWasted = true;
                wasteReason = 'Instance is idle — consider rightsizing or stopping';
            }
            break;
        }

        case 'rds': {
            const dbClass = node.meta?.instanceClass || 'db.t3.medium';
            const multiAZ = node.meta?.multiAZ || false;
            hourlyCost = (RDS_PRICING[dbClass] || 0.068) * (multiAZ ? 2 : 1);
            monthlyEstimate = hourlyCost * HOURS_PER_MONTH;
            const storageGB = node.meta?.allocatedStorage || 20;
            monthlyEstimate += storageGB * 0.115; // RDS gp2 storage
            details = `${dbClass}${multiAZ ? ' Multi-AZ' : ''} + ${storageGB}GB storage`;
            break;
        }

        case 'ebs': {
            const sizeGB = node.meta?.size || 30;
            const volType = node.meta?.volumeType || 'gp3';
            monthlyEstimate = sizeGB * EBS_PER_GB_MONTH;
            details = `${sizeGB}GB ${volType}`;
            if (node.status === 'orphan' || node.meta?.state === 'available') {
                isWasted = true;
                wasteReason = 'Unattached EBS volume — generating cost with no use';
            }
            break;
        }

        case 's3': {
            const estimatedGB = 50; // Default estimate
            monthlyEstimate = estimatedGB * S3_PER_GB_MONTH;
            details = `~${estimatedGB}GB estimated (Standard tier)`;
            break;
        }

        case 'lambda': {
            monthlyEstimate = (LAMBDA_EST_MONTHLY_INVOCATIONS / 1_000_000) * LAMBDA_PER_MILLION_REQUESTS;
            const memoryMB = node.meta?.memorySize || 128;
            const estDurationMs = 200;
            const gbSeconds = (memoryMB / 1024) * (estDurationMs / 1000) * LAMBDA_EST_MONTHLY_INVOCATIONS;
            monthlyEstimate += gbSeconds * 0.0000166667; // Per GB-second
            details = `${memoryMB}MB, ~${(LAMBDA_EST_MONTHLY_INVOCATIONS / 1000).toFixed(0)}K invocations/mo`;
            break;
        }

        case 'nat': {
            hourlyCost = FIXED_HOURLY.nat;
            monthlyEstimate = hourlyCost * HOURS_PER_MONTH;
            const estDataGB = 50;
            monthlyEstimate += estDataGB * 0.045; // Data processing
            details = `NAT Gateway + ~${estDataGB}GB data processing`;
            break;
        }

        case 'elb': {
            hourlyCost = FIXED_HOURLY.elb;
            monthlyEstimate = hourlyCost * HOURS_PER_MONTH;
            details = 'Application Load Balancer (hourly + LCU estimate)';
            if (node.status === 'idle') {
                isWasted = true;
                wasteReason = 'Load balancer appears idle — no active targets';
            }
            break;
        }

        case 'eip': {
            if (node.status === 'orphan' || node.meta?.associationId === undefined) {
                hourlyCost = FIXED_HOURLY.eip;
                monthlyEstimate = hourlyCost * HOURS_PER_MONTH;
                isWasted = true;
                wasteReason = 'Unused Elastic IP — AWS charges for unassociated EIPs';
                details = 'Unassociated EIP';
            } else {
                monthlyEstimate = 0;
                details = 'Associated EIP (no charge)';
            }
            break;
        }

        default: {
            monthlyEstimate = 0;
            details = 'No direct cost (management resource)';
            break;
        }
    }

    return {
        id: node.id,
        name: node.name,
        type: node.type,
        region: node.region,
        monthlyEstimate: Math.round(monthlyEstimate * 100) / 100,
        hourlyCost: Math.round(hourlyCost * 10000) / 10000,
        details,
        isWasted,
        wasteReason,
    };
}

// ── Main Export ────────────────────────────────────────────────────────────
export function estimateCosts(infraMap: InfraMap): CostEstimation {
    const resourceCosts = infraMap.nodes.map(estimateResourceCost);

    // Total
    const totalMonthly = resourceCosts.reduce((sum, r) => sum + r.monthlyEstimate, 0);

    // By service
    const serviceMap: Record<string, { cost: number; count: number }> = {};
    resourceCosts.forEach(r => {
        const svc = r.type.toUpperCase();
        if (!serviceMap[svc]) serviceMap[svc] = { cost: 0, count: 0 };
        serviceMap[svc].cost += r.monthlyEstimate;
        serviceMap[svc].count++;
    });
    const byService = Object.entries(serviceMap)
        .map(([service, v]) => ({ service, cost: Math.round(v.cost * 100) / 100, count: v.count }))
        .filter(s => s.cost > 0)
        .sort((a, b) => b.cost - a.cost);

    // By region
    const regionMap: Record<string, { cost: number; count: number }> = {};
    resourceCosts.forEach(r => {
        if (!regionMap[r.region]) regionMap[r.region] = { cost: 0, count: 0 };
        regionMap[r.region].cost += r.monthlyEstimate;
        regionMap[r.region].count++;
    });
    const byRegion = Object.entries(regionMap)
        .map(([region, v]) => ({ region, cost: Math.round(v.cost * 100) / 100, count: v.count }))
        .sort((a, b) => b.cost - a.cost);

    // Top drivers
    const topDrivers = [...resourceCosts]
        .filter(r => r.monthlyEstimate > 0)
        .sort((a, b) => b.monthlyEstimate - a.monthlyEstimate)
        .slice(0, 10);

    // Wasted
    const wastedResources = resourceCosts.filter(r => r.isWasted);
    const wastedCost = wastedResources.reduce((sum, r) => sum + r.monthlyEstimate, 0);

    return {
        totalMonthly: Math.round(totalMonthly * 100) / 100,
        byService,
        byRegion,
        byResource: resourceCosts,
        topDrivers,
        wastedCost: Math.round(wastedCost * 100) / 100,
        wastedResources,
        currency: 'USD',
        disclaimer: 'Estimates are approximate, based on us-east-1 on-demand pricing. Actual costs may vary.',
    };
}

// ── VPC-Grouped Cost Estimation ───────────────────────────────────────────

interface VpcCostGroup {
    vpcId: string;
    vpcName: string;
    region: string;
    totalMonthly: number;
    wastedCost: number;
    resourceCount: number;
    byService: { service: string; cost: number; count: number }[];
    resources: ResourceCost[];
    wastedResources: ResourceCost[];
}

export interface VpcCostEstimation {
    vpcGroups: VpcCostGroup[];
    unattachedResources: VpcCostGroup;   // resources not in any VPC (S3, IAM, etc.)
    grandTotalMonthly: number;
    grandWastedCost: number;
    currency: string;
    disclaimer: string;
}

export function estimateCostsByVpc(infraMap: InfraMap): VpcCostEstimation {
    const resourceCosts = infraMap.nodes.map(estimateResourceCost);

    // Build a map: nodeId → vpcId (using meta.vpcId or edge traversal)
    const nodeVpcMap = new Map<string, string>();

    // First pass: direct vpcId in meta
    for (const node of infraMap.nodes) {
        if (node.type === 'vpc') {
            nodeVpcMap.set(node.id, node.id);
        } else if (node.meta?.vpcId) {
            // Find the matching VPC node id
            const vpcNode = infraMap.nodes.find(
                n => n.type === 'vpc' && (n.meta?.vpcId === node.meta.vpcId || n.id.includes(node.meta.vpcId))
            );
            if (vpcNode) {
                nodeVpcMap.set(node.id, vpcNode.id);
            }
        }
    }

    // Second pass: use edges to link resources that don't have direct vpcId
    // e.g., EBS attached to EC2 which is in a VPC
    for (const edge of infraMap.edges) {
        const sourceVpc = nodeVpcMap.get(edge.source);
        const targetVpc = nodeVpcMap.get(edge.target);
        if (sourceVpc && !targetVpc) {
            nodeVpcMap.set(edge.target, sourceVpc);
        } else if (targetVpc && !sourceVpc) {
            nodeVpcMap.set(edge.source, targetVpc);
        }
    }

    // Group costs by VPC
    const vpcMap = new Map<string, { node: InfraNode; costs: ResourceCost[] }>();
    const unattached: ResourceCost[] = [];

    for (let i = 0; i < infraMap.nodes.length; i++) {
        const node = infraMap.nodes[i];
        const cost = resourceCosts[i];
        const vpcId = nodeVpcMap.get(node.id);

        if (vpcId && node.type !== 'vpc') {
            if (!vpcMap.has(vpcId)) {
                const vpcNode = infraMap.nodes.find(n => n.id === vpcId);
                if (vpcNode) vpcMap.set(vpcId, { node: vpcNode, costs: [] });
            }
            vpcMap.get(vpcId)?.costs.push(cost);
        } else if (node.type !== 'vpc') {
            unattached.push(cost);
        }
    }

    // Build VPC cost groups
    const vpcGroups: VpcCostGroup[] = [];
    for (const [vpcId, { node, costs }] of vpcMap.entries()) {
        const totalMonthly = costs.reduce((s, r) => s + r.monthlyEstimate, 0);
        const wastedRes = costs.filter(r => r.isWasted);
        const wastedCost = wastedRes.reduce((s, r) => s + r.monthlyEstimate, 0);

        // By service within this VPC
        const svcMap: Record<string, { cost: number; count: number }> = {};
        costs.forEach(r => {
            const svc = r.type.toUpperCase();
            if (!svcMap[svc]) svcMap[svc] = { cost: 0, count: 0 };
            svcMap[svc].cost += r.monthlyEstimate;
            svcMap[svc].count++;
        });
        const byService = Object.entries(svcMap)
            .map(([service, v]) => ({ service, cost: Math.round(v.cost * 100) / 100, count: v.count }))
            .filter(s => s.cost > 0 || s.count > 0)
            .sort((a, b) => b.cost - a.cost);

        vpcGroups.push({
            vpcId,
            vpcName: node.name || vpcId,
            region: node.region,
            totalMonthly: Math.round(totalMonthly * 100) / 100,
            wastedCost: Math.round(wastedCost * 100) / 100,
            resourceCount: costs.length,
            byService,
            resources: costs.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate),
            wastedResources: wastedRes,
        });
    }

    // Sort VPCs by cost descending
    vpcGroups.sort((a, b) => b.totalMonthly - a.totalMonthly);

    // Unattached resources group
    const unattachedTotal = unattached.reduce((s, r) => s + r.monthlyEstimate, 0);
    const unattachedWasted = unattached.filter(r => r.isWasted);
    const unattachedWastedCost = unattachedWasted.reduce((s, r) => s + r.monthlyEstimate, 0);

    const unattachedSvcMap: Record<string, { cost: number; count: number }> = {};
    unattached.forEach(r => {
        const svc = r.type.toUpperCase();
        if (!unattachedSvcMap[svc]) unattachedSvcMap[svc] = { cost: 0, count: 0 };
        unattachedSvcMap[svc].cost += r.monthlyEstimate;
        unattachedSvcMap[svc].count++;
    });

    const unattachedGroup: VpcCostGroup = {
        vpcId: 'unattached',
        vpcName: 'Global / Unattached Resources',
        region: 'global',
        totalMonthly: Math.round(unattachedTotal * 100) / 100,
        wastedCost: Math.round(unattachedWastedCost * 100) / 100,
        resourceCount: unattached.length,
        byService: Object.entries(unattachedSvcMap)
            .map(([service, v]) => ({ service, cost: Math.round(v.cost * 100) / 100, count: v.count }))
            .sort((a, b) => b.cost - a.cost),
        resources: unattached.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate),
        wastedResources: unattachedWasted,
    };

    const grandTotal = vpcGroups.reduce((s, g) => s + g.totalMonthly, 0) + unattachedGroup.totalMonthly;
    const grandWasted = vpcGroups.reduce((s, g) => s + g.wastedCost, 0) + unattachedGroup.wastedCost;

    return {
        vpcGroups,
        unattachedResources: unattachedGroup,
        grandTotalMonthly: Math.round(grandTotal * 100) / 100,
        grandWastedCost: Math.round(grandWasted * 100) / 100,
        currency: 'USD',
        disclaimer: 'Estimates are approximate, based on us-east-1 on-demand pricing. Actual costs may vary.',
    };
}
