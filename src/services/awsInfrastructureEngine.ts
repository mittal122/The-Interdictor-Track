/**
 * AWS Infrastructure Intelligence Engine — Phase 1 MVP
 * 
 * Discovers all resources across the user's AWS account,
 * builds a dependency graph, and detects orphaned/idle resources.
 */

import {
    EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand,
    DescribeInternetGatewaysCommand, DescribeNatGatewaysCommand,
    DescribeRouteTablesCommand, DescribeSecurityGroupsCommand,
    DescribeInstancesCommand, DescribeVolumesCommand,
    DescribeAddressesCommand, DescribeRegionsCommand
} from "@aws-sdk/client-ec2";
import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand, DescribeTargetGroupsCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import { LambdaClient, ListFunctionsCommand } from "@aws-sdk/client-lambda";
import { IAMClient, ListRolesCommand, ListUsersCommand, ListPoliciesCommand } from "@aws-sdk/client-iam";
import { RDSClient, DescribeDBInstancesCommand } from "@aws-sdk/client-rds";
import { AutoScalingClient, DescribeAutoScalingGroupsCommand } from "@aws-sdk/client-auto-scaling";
import { Route53Client, ListHostedZonesCommand } from "@aws-sdk/client-route-53";
import { PerRequestCredentials } from "./awsIntegrationService";
import dotenv from "dotenv";

dotenv.config();

// ── Types ─────────────────────────────────────────────────────────────────
export type ResourceStatus = "active" | "stopped" | "idle" | "orphan" | "pending";

export interface InfraNode {
    id: string;
    type: string;           // e.g. "vpc", "subnet", "ec2", "s3", "lambda", "elb", "igw", "nat", "sg", "ebs", "eip", "route-table", "target-group"
    category: string;       // "networking" | "compute" | "storage" | "load-balancing"
    name: string;
    region: string;
    status: ResourceStatus;
    meta: Record<string, any>;  // service-specific details
    instanceId?: string;        // raw AWS id for lifecycle actions
}

export interface InfraEdge {
    source: string;   // node id
    target: string;   // node id
    label: string;    // relationship description
}

export interface InfraMap {
    nodes: InfraNode[];
    edges: InfraEdge[];
    summary: {
        totalResources: number;
        activeCount: number;
        stoppedCount: number;
        orphanCount: number;
        idleCount: number;
        regionCount: number;
        serviceTypes: string[];
    };
    fetchedAt: number;
}

// ── Cache ─────────────────────────────────────────────────────────────────
let infraCache: { data: InfraMap; timestamp: number; key: string } | null = null;
const CACHE_TTL = 60_000; // 60 seconds

// ── Credential resolution (reuse from main service) ───────────────────────
function resolveCredentials(perRequest?: PerRequestCredentials | null) {
    const SERVER_KEY = process.env.AWS_ACCESS_KEY_ID;
    const SERVER_SECRET = process.env.AWS_SECRET_ACCESS_KEY;
    const SERVER_REGION = process.env.AWS_REGION || "us-east-1";

    if (perRequest?.awsAccessKeyId && perRequest?.awsSecretKey) {
        return {
            credentials: { accessKeyId: perRequest.awsAccessKeyId, secretAccessKey: perRequest.awsSecretKey },
            region: perRequest.awsRegion || SERVER_REGION,
        };
    }
    if (SERVER_KEY && SERVER_SECRET) {
        return {
            credentials: { accessKeyId: SERVER_KEY, secretAccessKey: SERVER_SECRET },
            region: SERVER_REGION,
        };
    }
    return null;
}

// ── Main Entry Point ──────────────────────────────────────────────────────
export async function getFullAccountInfrastructure(
    perRequest?: PerRequestCredentials | null
): Promise<InfraMap | null> {
    const resolved = resolveCredentials(perRequest);
    if (!resolved) return null;

    // Cache check
    const cacheKey = resolved.credentials.accessKeyId;
    if (infraCache && infraCache.key === cacheKey && Date.now() - infraCache.timestamp < CACHE_TTL) {
        return infraCache.data;
    }

    const nodes: InfraNode[] = [];
    const edges: InfraEdge[] = [];

    try {
        // 1. Discover regions
        const ec2 = new EC2Client({ region: resolved.region, credentials: resolved.credentials });
        let regions: string[] = [resolved.region];
        try {
            const regResp = await ec2.send(new DescribeRegionsCommand({ AllRegions: false }));
            regions = (regResp.Regions || []).map(r => r.RegionName).filter((r): r is string => !!r);
        } catch { /* fallback to default region */ }

        console.log(`[INFRA] Scanning ${regions.length} regions...`);

        // 2. Fetch Global Services (S3, IAM, Route53)
        await Promise.allSettled([
            fetchS3(resolved.credentials, resolved.region, nodes),
            fetchIAM(resolved.credentials, resolved.region, nodes),
            fetchRoute53(resolved.credentials, resolved.region, nodes),
        ]);

        // 3. Fetch per-region resources in parallel
        await Promise.all(regions.map(region =>
            fetchRegionResources(resolved.credentials, region, nodes, edges)
        ));

        // 4. Run orphan detection
        detectOrphans(nodes, edges);

        // 5. Build summary
        const serviceTypes = [...new Set(nodes.map(n => n.type))];
        const summary = {
            totalResources: nodes.length,
            activeCount: nodes.filter(n => n.status === "active").length,
            stoppedCount: nodes.filter(n => n.status === "stopped").length,
            orphanCount: nodes.filter(n => n.status === "orphan").length,
            idleCount: nodes.filter(n => n.status === "idle").length,
            regionCount: [...new Set(nodes.map(n => n.region))].length,
            serviceTypes,
        };

        const result: InfraMap = { nodes, edges, summary, fetchedAt: Date.now() };
        infraCache = { data: result, timestamp: Date.now(), key: cacheKey };
        console.log(`[INFRA] Scan complete: ${nodes.length} resources, ${edges.length} relationships`);
        return result;
    } catch (err) {
        console.error("[INFRA] Full scan error:", err);
        return null;
    }
}

// ── Per-Region Fetch ──────────────────────────────────────────────────────
async function fetchRegionResources(
    credentials: { accessKeyId: string; secretAccessKey: string },
    region: string,
    nodes: InfraNode[],
    edges: InfraEdge[]
) {
    const ec2 = new EC2Client({ region, credentials });
    const elbClient = new ElasticLoadBalancingV2Client({ region, credentials });
    const lambdaClient = new LambdaClient({ region, credentials });
    const rdsClient = new RDSClient({ region, credentials });
    const asgClient = new AutoScalingClient({ region, credentials });

    await Promise.allSettled([
        fetchVPCs(ec2, region, nodes, edges),
        fetchSubnets(ec2, region, nodes, edges),
        fetchIGWs(ec2, region, nodes, edges),
        fetchNATGWs(ec2, region, nodes, edges),
        fetchRouteTables(ec2, region, nodes, edges),
        fetchSecurityGroups(ec2, region, nodes),
        fetchEC2(ec2, region, nodes, edges),
        fetchEBS(ec2, region, nodes, edges),
        fetchElasticIPs(ec2, region, nodes),
        fetchELBs(elbClient, region, nodes, edges),
        fetchLambda(lambdaClient, region, nodes),
        fetchRDS(rdsClient, region, nodes, edges),
        fetchASG(asgClient, region, nodes, edges),
    ]);
}

// ── Individual Fetchers ───────────────────────────────────────────────────

async function fetchVPCs(ec2: EC2Client, region: string, nodes: InfraNode[], edges: InfraEdge[]) {
    try {
        const res = await ec2.send(new DescribeVpcsCommand({}));
        for (const vpc of res.Vpcs || []) {
            const name = vpc.Tags?.find(t => t.Key === "Name")?.Value || vpc.VpcId || "Unnamed VPC";
            nodes.push({
                id: `vpc-${region}-${vpc.VpcId}`,
                type: "vpc", category: "networking", name,
                region, status: vpc.State === "available" ? "active" : "pending",
                meta: { vpcId: vpc.VpcId, cidr: vpc.CidrBlock, isDefault: vpc.IsDefault },
            });
        }
    } catch (e: any) { console.error(`[INFRA][${region}] VPC error:`, e.message); }
}

async function fetchSubnets(ec2: EC2Client, region: string, nodes: InfraNode[], edges: InfraEdge[]) {
    try {
        const res = await ec2.send(new DescribeSubnetsCommand({}));
        for (const sub of res.Subnets || []) {
            const name = sub.Tags?.find(t => t.Key === "Name")?.Value || sub.SubnetId || "Unnamed Subnet";
            const isPublic = sub.MapPublicIpOnLaunch || false;
            nodes.push({
                id: `subnet-${region}-${sub.SubnetId}`,
                type: "subnet", category: "networking", name,
                region, status: sub.State === "available" ? "active" : "pending",
                meta: { subnetId: sub.SubnetId, vpcId: sub.VpcId, cidr: sub.CidrBlock, az: sub.AvailabilityZone, isPublic },
            });
            // Edge: VPC → Subnet
            if (sub.VpcId) {
                edges.push({ source: `vpc-${region}-${sub.VpcId}`, target: `subnet-${region}-${sub.SubnetId}`, label: "contains" });
            }
        }
    } catch (e: any) { console.error(`[INFRA][${region}] Subnet error:`, e.message); }
}

async function fetchIGWs(ec2: EC2Client, region: string, nodes: InfraNode[], edges: InfraEdge[]) {
    try {
        const res = await ec2.send(new DescribeInternetGatewaysCommand({}));
        for (const igw of res.InternetGateways || []) {
            const name = igw.Tags?.find(t => t.Key === "Name")?.Value || igw.InternetGatewayId || "IGW";
            const attachedVpc = igw.Attachments?.[0]?.VpcId;
            nodes.push({
                id: `igw-${region}-${igw.InternetGatewayId}`,
                type: "igw", category: "networking", name,
                region, status: attachedVpc ? "active" : "idle",
                meta: { igwId: igw.InternetGatewayId, attachedVpc },
            });
            if (attachedVpc) {
                edges.push({ source: `igw-${region}-${igw.InternetGatewayId}`, target: `vpc-${region}-${attachedVpc}`, label: "attached-to" });
            }
        }
    } catch (e: any) { console.error(`[INFRA][${region}] IGW error:`, e.message); }
}

async function fetchNATGWs(ec2: EC2Client, region: string, nodes: InfraNode[], edges: InfraEdge[]) {
    try {
        const res = await ec2.send(new DescribeNatGatewaysCommand({}));
        for (const nat of res.NatGateways || []) {
            const name = nat.Tags?.find(t => t.Key === "Name")?.Value || nat.NatGatewayId || "NAT";
            const statusMap: Record<string, ResourceStatus> = { available: "active", pending: "pending", deleting: "pending", deleted: "stopped", failed: "orphan" };
            nodes.push({
                id: `nat-${region}-${nat.NatGatewayId}`,
                type: "nat", category: "networking", name,
                region, status: statusMap[nat.State || ""] || "idle",
                meta: { natId: nat.NatGatewayId, subnetId: nat.SubnetId, vpcId: nat.VpcId },
            });
            if (nat.SubnetId) {
                edges.push({ source: `nat-${region}-${nat.NatGatewayId}`, target: `subnet-${region}-${nat.SubnetId}`, label: "in-subnet" });
            }
        }
    } catch (e: any) { console.error(`[INFRA][${region}] NAT error:`, e.message); }
}

async function fetchRouteTables(ec2: EC2Client, region: string, nodes: InfraNode[], edges: InfraEdge[]) {
    try {
        const res = await ec2.send(new DescribeRouteTablesCommand({}));
        for (const rt of res.RouteTables || []) {
            const name = rt.Tags?.find(t => t.Key === "Name")?.Value || rt.RouteTableId || "RT";
            nodes.push({
                id: `rt-${region}-${rt.RouteTableId}`,
                type: "route-table", category: "networking", name,
                region, status: "active",
                meta: { rtId: rt.RouteTableId, vpcId: rt.VpcId, routeCount: rt.Routes?.length || 0 },
            });
            if (rt.VpcId) {
                edges.push({ source: `vpc-${region}-${rt.VpcId}`, target: `rt-${region}-${rt.RouteTableId}`, label: "has-route-table" });
            }
            for (const assoc of rt.Associations || []) {
                if (assoc.SubnetId) {
                    edges.push({ source: `rt-${region}-${rt.RouteTableId}`, target: `subnet-${region}-${assoc.SubnetId}`, label: "associated" });
                }
            }
        }
    } catch (e: any) { console.error(`[INFRA][${region}] RT error:`, e.message); }
}

async function fetchSecurityGroups(ec2: EC2Client, region: string, nodes: InfraNode[]) {
    try {
        const res = await ec2.send(new DescribeSecurityGroupsCommand({}));
        for (const sg of res.SecurityGroups || []) {
            nodes.push({
                id: `sg-${region}-${sg.GroupId}`,
                type: "sg", category: "networking",
                name: sg.GroupName || sg.GroupId || "SG",
                region, status: "active",
                meta: { sgId: sg.GroupId, vpcId: sg.VpcId, description: sg.Description, inboundRules: sg.IpPermissions?.length || 0, outboundRules: sg.IpPermissionsEgress?.length || 0 },
            });
        }
    } catch (e: any) { console.error(`[INFRA][${region}] SG error:`, e.message); }
}

async function fetchEC2(ec2: EC2Client, region: string, nodes: InfraNode[], edges: InfraEdge[]) {
    try {
        const res = await ec2.send(new DescribeInstancesCommand({}));
        for (const reservation of res.Reservations || []) {
            for (const inst of reservation.Instances || []) {
                if (inst.State?.Name === "terminated") continue;
                const name = inst.Tags?.find(t => t.Key === "Name")?.Value || inst.InstanceId || "Instance";
                const statusMap: Record<string, ResourceStatus> = { running: "active", stopped: "stopped", pending: "pending", "shutting-down": "pending", stopping: "pending" };
                nodes.push({
                    id: `ec2-${region}-${inst.InstanceId}`,
                    type: "ec2", category: "compute", name,
                    region, status: statusMap[inst.State?.Name || ""] || "stopped",
                    instanceId: inst.InstanceId,
                    meta: { instanceId: inst.InstanceId, type: inst.InstanceType, subnetId: inst.SubnetId, vpcId: inst.VpcId, publicIp: inst.PublicIpAddress, privateIp: inst.PrivateIpAddress, state: inst.State?.Name },
                });
                if (inst.SubnetId) {
                    edges.push({ source: `subnet-${region}-${inst.SubnetId}`, target: `ec2-${region}-${inst.InstanceId}`, label: "hosts" });
                }
                for (const sg of inst.SecurityGroups || []) {
                    if (sg.GroupId) {
                        edges.push({ source: `ec2-${region}-${inst.InstanceId}`, target: `sg-${region}-${sg.GroupId}`, label: "uses-sg" });
                    }
                }
            }
        }
    } catch (e: any) { console.error(`[INFRA][${region}] EC2 error:`, e.message); }
}

async function fetchEBS(ec2: EC2Client, region: string, nodes: InfraNode[], edges: InfraEdge[]) {
    try {
        const res = await ec2.send(new DescribeVolumesCommand({}));
        for (const vol of res.Volumes || []) {
            const name = vol.Tags?.find(t => t.Key === "Name")?.Value || vol.VolumeId || "Volume";
            const attached = (vol.Attachments?.length || 0) > 0;
            nodes.push({
                id: `ebs-${region}-${vol.VolumeId}`,
                type: "ebs", category: "storage", name,
                region, status: attached ? "active" : "orphan",
                meta: { volumeId: vol.VolumeId, size: vol.Size, volumeType: vol.VolumeType, state: vol.State, attachedTo: vol.Attachments?.[0]?.InstanceId },
            });
            if (vol.Attachments?.[0]?.InstanceId) {
                edges.push({ source: `ec2-${region}-${vol.Attachments[0].InstanceId}`, target: `ebs-${region}-${vol.VolumeId}`, label: "attached-volume" });
            }
        }
    } catch (e: any) { console.error(`[INFRA][${region}] EBS error:`, e.message); }
}

async function fetchElasticIPs(ec2: EC2Client, region: string, nodes: InfraNode[]) {
    try {
        const res = await ec2.send(new DescribeAddressesCommand({}));
        for (const eip of res.Addresses || []) {
            nodes.push({
                id: `eip-${region}-${eip.AllocationId}`,
                type: "eip", category: "networking",
                name: eip.PublicIp || eip.AllocationId || "EIP",
                region, status: eip.AssociationId ? "active" : "orphan",
                meta: { allocationId: eip.AllocationId, publicIp: eip.PublicIp, instanceId: eip.InstanceId, associationId: eip.AssociationId },
            });
        }
    } catch (e: any) { console.error(`[INFRA][${region}] EIP error:`, e.message); }
}

async function fetchELBs(client: ElasticLoadBalancingV2Client, region: string, nodes: InfraNode[], edges: InfraEdge[]) {
    try {
        const res = await client.send(new DescribeLoadBalancersCommand({}));
        for (const lb of res.LoadBalancers || []) {
            const name = lb.LoadBalancerName || lb.LoadBalancerArn || "ELB";
            nodes.push({
                id: `elb-${region}-${lb.LoadBalancerArn?.split("/").pop()}`,
                type: "elb", category: "load-balancing", name,
                region, status: lb.State?.Code === "active" ? "active" : "idle",
                meta: { arn: lb.LoadBalancerArn, type: lb.Type, scheme: lb.Scheme, vpcId: lb.VpcId, dnsName: lb.DNSName },
            });
            if (lb.VpcId) {
                edges.push({ source: `vpc-${region}-${lb.VpcId}`, target: `elb-${region}-${lb.LoadBalancerArn?.split("/").pop()}`, label: "contains-elb" });
            }
        }
        // Target Groups
        const tgRes = await client.send(new DescribeTargetGroupsCommand({}));
        for (const tg of tgRes.TargetGroups || []) {
            nodes.push({
                id: `tg-${region}-${tg.TargetGroupArn?.split("/").pop()}`,
                type: "target-group", category: "load-balancing",
                name: tg.TargetGroupName || "TG",
                region, status: "active",
                meta: { arn: tg.TargetGroupArn, protocol: tg.Protocol, port: tg.Port, vpcId: tg.VpcId },
            });
            for (const lbArn of tg.LoadBalancerArns || []) {
                edges.push({
                    source: `elb-${region}-${lbArn.split("/").pop()}`,
                    target: `tg-${region}-${tg.TargetGroupArn?.split("/").pop()}`,
                    label: "routes-to",
                });
            }
        }
    } catch (e: any) { console.error(`[INFRA][${region}] ELB error:`, e.message); }
}

async function fetchS3(credentials: { accessKeyId: string; secretAccessKey: string }, region: string, nodes: InfraNode[]) {
    try {
        const client = new S3Client({ region, credentials });
        const res = await client.send(new ListBucketsCommand({}));
        for (const bucket of res.Buckets || []) {
            nodes.push({
                id: `s3-global-${bucket.Name}`,
                type: "s3", category: "storage",
                name: bucket.Name || "Bucket",
                region: "global", status: "active",
                meta: { name: bucket.Name, creationDate: bucket.CreationDate?.toISOString() },
            });
        }
    } catch (e: any) { console.error("[INFRA] S3 error:", e.message); }
}

async function fetchLambda(client: LambdaClient, region: string, nodes: InfraNode[]) {
    try {
        const res = await client.send(new ListFunctionsCommand({}));
        for (const fn of res.Functions || []) {
            nodes.push({
                id: `lambda-${region}-${fn.FunctionName}`,
                type: "lambda", category: "compute",
                name: fn.FunctionName || "Function",
                region, status: fn.State === "Active" ? "active" : "idle",
                meta: { arn: fn.FunctionArn, runtime: fn.Runtime, memoryMB: fn.MemorySize, timeout: fn.Timeout, lastModified: fn.LastModified, role: fn.Role },
            });
        }
    } catch (e: any) { console.error(`[INFRA][${region}] Lambda error:`, e.message); }
}

async function fetchRDS(client: RDSClient, region: string, nodes: InfraNode[], edges: InfraEdge[]) {
    try {
        const res = await client.send(new DescribeDBInstancesCommand({}));
        for (const db of res.DBInstances || []) {
            const statusMap: Record<string, ResourceStatus> = { available: "active", stopped: "stopped", creating: "pending", starting: "pending", backing_up: "active" };
            const status = statusMap[db.DBInstanceStatus || ""] || "idle";

            nodes.push({
                id: `rds-${region}-${db.DBInstanceIdentifier}`,
                type: "rds", category: "database",
                name: db.DBInstanceIdentifier || "RDS Instance",
                region, status,
                meta: {
                    engine: db.Engine, version: db.EngineVersion,
                    class: db.DBInstanceClass, multiAz: db.MultiAZ,
                    storage: db.AllocatedStorage, subnetGroup: db.DBSubnetGroup?.DBSubnetGroupName
                },
            });

            // Edge: Subnet -> RDS
            for (const sub of db.DBSubnetGroup?.Subnets || []) {
                if (sub.SubnetIdentifier) {
                    edges.push({
                        source: `subnet-${region}-${sub.SubnetIdentifier}`,
                        target: `rds-${region}-${db.DBInstanceIdentifier}`,
                        label: "hosts-db"
                    });
                }
            }
            // Edge: SG -> RDS
            for (const sg of db.VpcSecurityGroups || []) {
                if (sg.VpcSecurityGroupId) {
                    edges.push({
                        source: `rds-${region}-${db.DBInstanceIdentifier}`,
                        target: `sg-${region}-${sg.VpcSecurityGroupId}`,
                        label: "uses-sg"
                    });
                }
            }
        }
    } catch (e: any) { console.error(`[INFRA][${region}] RDS error:`, e.message); }
}

async function fetchASG(client: AutoScalingClient, region: string, nodes: InfraNode[], edges: InfraEdge[]) {
    try {
        const res = await client.send(new DescribeAutoScalingGroupsCommand({}));
        for (const asg of res.AutoScalingGroups || []) {
            const hasInstances = (asg.Instances?.length || 0) > 0;

            nodes.push({
                id: `asg-${region}-${asg.AutoScalingGroupName}`,
                type: "asg", category: "compute",
                name: asg.AutoScalingGroupName || "AutoScaling Group",
                region, status: hasInstances ? "active" : "orphan",
                meta: {
                    minSize: asg.MinSize, maxSize: asg.MaxSize, desiredCapacity: asg.DesiredCapacity,
                    instanceCount: asg.Instances?.length || 0,
                    vpcZoneIdentifier: asg.VPCZoneIdentifier
                },
            });

            // Edge: ASG -> EC2 Instances
            for (const inst of asg.Instances || []) {
                if (inst.InstanceId) {
                    edges.push({
                        source: `asg-${region}-${asg.AutoScalingGroupName}`,
                        target: `ec2-${region}-${inst.InstanceId}`,
                        label: "manages"
                    });
                }
            }
        }
    } catch (e: any) { console.error(`[INFRA][${region}] ASG error:`, e.message); }
}

async function fetchIAM(credentials: { accessKeyId: string; secretAccessKey: string }, region: string, nodes: InfraNode[]) {
    try {
        // IAM is global but needs a region to init client. STS/IAM usually endpoints at us-east-1
        const client = new IAMClient({ region: "us-east-1", credentials });

        // Roles
        try {
            const rolesRes = await client.send(new ListRolesCommand({ MaxItems: 50 })); // cap to prevent blowout
            for (const role of rolesRes.Roles || []) {
                // omit aws-service-role to reduce noise
                if (role.Path?.startsWith("/aws-service-role/")) continue;
                nodes.push({
                    id: `iam-role-${role.RoleId}`, type: "iam-role", category: "security",
                    name: role.RoleName || "Role", region: "global", status: "active",
                    meta: { arn: role.Arn, createDate: role.CreateDate?.toISOString() }
                });
            }
        } catch (e: any) { console.error("[INFRA] IAM Role Error:", e.message); }

        // Users
        try {
            const usersRes = await client.send(new ListUsersCommand({ MaxItems: 50 }));
            for (const user of usersRes.Users || []) {
                nodes.push({
                    id: `iam-user-${user.UserId}`, type: "iam-user", category: "security",
                    name: user.UserName || "User", region: "global", status: "active",
                    meta: { arn: user.Arn, createDate: user.CreateDate?.toISOString() }
                });
            }
        } catch (e: any) { console.error("[INFRA] IAM User Error:", e.message); }

    } catch (e: any) { console.error("[INFRA] IAM error:", e.message); }
}

async function fetchRoute53(credentials: { accessKeyId: string; secretAccessKey: string }, region: string, nodes: InfraNode[]) {
    try {
        // global
        const client = new Route53Client({ region: "us-east-1", credentials });
        const res = await client.send(new ListHostedZonesCommand({}));
        for (const zone of res.HostedZones || []) {
            nodes.push({
                id: `r53-zone-${zone.Id?.split("/").pop()}`, type: "route53-zone", category: "networking",
                name: zone.Name || "Hosted Zone", region: "global", status: "active",
                meta: { callerReference: zone.CallerReference, recordCount: zone.ResourceRecordSetCount, privateZone: zone.Config?.PrivateZone }
            });
        }
    } catch (e: any) { console.error("[INFRA] Route53 error:", e.message); }
}

// ── Orphan Detection Engine ───────────────────────────────────────────────
function detectOrphans(nodes: InfraNode[], edges: InfraEdge[]) {
    const targetIds = new Set(edges.map(e => e.target));
    const sourceIds = new Set(edges.map(e => e.source));
    const connectedIds = new Set([...targetIds, ...sourceIds]);

    for (const node of nodes) {
        // EBS with no edges = orphan
        if (node.type === "ebs" && !connectedIds.has(node.id)) {
            node.status = "orphan";
        }
        // EIP not associated = orphan
        if (node.type === "eip" && !node.meta.associationId) {
            node.status = "orphan";
        }
        // SG with no instance connections = potentially idle
        if (node.type === "sg") {
            const hasConnection = edges.some(e => e.target === node.id && e.label === "uses-sg");
            if (!hasConnection && node.name !== "default") {
                node.status = "idle";
            }
        }
    }
}
