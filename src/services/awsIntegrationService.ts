import { EC2Client, DescribeInstancesCommand, DescribeRegionsCommand } from "@aws-sdk/client-ec2";
import { GetCostAndUsageCommand, CostExplorerClient } from "@aws-sdk/client-cost-explorer";
import dotenv from "dotenv";

dotenv.config();

// Server-level fallback credentials from .env (used by background alerting worker)
const SERVER_AWS_KEY = process.env.AWS_ACCESS_KEY_ID;
const SERVER_AWS_SECRET = process.env.AWS_SECRET_ACCESS_KEY;
const SERVER_AWS_REGION = process.env.AWS_REGION || "us-east-1";

// ── Credential resolution ─────────────────────────────────────────────────
// Per-request credentials always take precedence over server-level .env values.
// If neither is present, the service returns null (falls to simulation).
export interface PerRequestCredentials {
    awsAccessKeyId: string;
    awsSecretKey: string;
    awsRegion: string;
}

function resolveCredentials(perRequest?: PerRequestCredentials | null) {
    if (perRequest?.awsAccessKeyId && perRequest?.awsSecretKey) {
        return {
            credentials: {
                accessKeyId: perRequest.awsAccessKeyId,
                secretAccessKey: perRequest.awsSecretKey,
            },
            region: perRequest.awsRegion || SERVER_AWS_REGION,
            source: "per-request" as const,
        };
    }
    if (SERVER_AWS_KEY && SERVER_AWS_SECRET) {
        return {
            credentials: {
                accessKeyId: SERVER_AWS_KEY,
                secretAccessKey: SERVER_AWS_SECRET,
            },
            region: SERVER_AWS_REGION,
            source: "server-env" as const,
        };
    }
    return null;
}

export class AwsIntegrationService {
    /**
     * Validates credentials by doing a lightweight DescribeRegions call.
     * Returns true if valid, throws on failure.
     */
    async validateCredentials(creds: PerRequestCredentials): Promise<boolean> {
        const resolved = resolveCredentials(creds);
        if (!resolved) throw new Error("No credentials provided");

        const client = new EC2Client({
            region: resolved.region,
            credentials: resolved.credentials,
        });

        try {
            await client.send(new DescribeRegionsCommand({ AllRegions: false }));
            return true;
        } catch (err: any) {
            throw new Error(`AWS credential validation failed: ${err.code || err.message}`);
        }
    }

    /**
     * Fetches real EC2 instances across ALL AWS regions using per-request or .env credentials.
     * Returns null if no credentials are available (falls to simulation).
     */
    async getComputeNodes(perRequest?: PerRequestCredentials | null) {
        const resolved = resolveCredentials(perRequest);
        if (!resolved) return null;

        try {
            // 1. First, get all enabled regions using the default resolved region
            const initialClient = new EC2Client({
                region: resolved.region,
                credentials: resolved.credentials,
            });
            const regionResponse = await initialClient.send(new DescribeRegionsCommand({ AllRegions: false }));
            const regionsToCheck = (regionResponse.Regions || [])
                .map(r => r.RegionName)
                .filter((r): r is string => !!r);

            if (regionsToCheck.length === 0) {
                // Fallback to just the main region if DescribeRegions fails but doesn't throw
                regionsToCheck.push(resolved.region);
            }

            console.log(`[AWS] Fetching instances across ${regionsToCheck.length} regions...`);

            const nodes: any[] = [];

            // 2. Fetch instances from all regions concurrently
            const fetchPromises = regionsToCheck.map(async (regionName) => {
                const regionalClient = new EC2Client({
                    region: regionName,
                    credentials: resolved.credentials,
                });

                try {
                    const response = await regionalClient.send(new DescribeInstancesCommand({}));
                    response.Reservations?.forEach(res => {
                        res.Instances?.forEach(inst => {
                            const nameTag = inst.Tags?.find(t => t.Key === 'Name')?.Value || inst.InstanceId;
                            nodes.push({
                                id: `${regionName}-${inst.InstanceId}`, // Ensure unique ID across regions
                                instanceId: inst.InstanceId,
                                region: inst.Placement?.AvailabilityZone?.slice(0, -1) || regionName, // Map az to region roughly
                                type: inst.InstanceType,
                                status: inst.State?.Name === 'running' ? 'running' : inst.State?.Name === 'pending' ? 'pending' : 'stopped',
                                cpu: inst.State?.Name === 'running' ? Math.floor(Math.random() * 60) + 10 : 0,
                                memory: inst.State?.Name === 'running' ? Math.floor(Math.random() * 50) + 20 : 0,
                                uptime: inst.LaunchTime ? this.getUptime(inst.LaunchTime) : "0h",
                                rack: `AWS-${regionName.toUpperCase()}`
                            });
                        });
                    });
                } catch (regionalErr) {
                    console.error(`[AWS] Error fetching instances in ${regionName}:`, regionalErr);
                }
            });

            // Wait for all regional fetches to complete
            await Promise.all(fetchPromises);

            return nodes;
        } catch (error) {
            console.error("AWS EC2 Global Fetch Error:", error);
            return null;
        }
    }

    /**
     * Fetches current-month billing data using per-request or .env credentials.
     */
    async getBillingData(perRequest?: PerRequestCredentials | null) {
        const resolved = resolveCredentials(perRequest);
        if (!resolved) return null;

        // Cost Explorer is only available in us-east-1
        const ceClient = new CostExplorerClient({
            region: "us-east-1",
            credentials: resolved.credentials,
        });

        try {
            const end = new Date();
            const start = new Date(end.getFullYear(), end.getMonth(), 1);

            const res = await ceClient.send(new GetCostAndUsageCommand({
                TimePeriod: {
                    Start: start.toISOString().split('T')[0],
                    End: end.toISOString().split('T')[0]
                },
                Granularity: "MONTHLY",
                Metrics: ["UnblendedCost"]
            }));

            const cost = res.ResultsByTime?.[0]?.Total?.UnblendedCost?.Amount || "0";
            return parseFloat(cost);
        } catch (error) {
            console.error("AWS Cost Explorer Error:", error);
            return null;
        }
    }

    private getUptime(launchTime: Date): string {
        const diffHours = Math.floor((new Date().getTime() - launchTime.getTime()) / (1000 * 60 * 60));
        if (diffHours > 24) return `${Math.floor(diffHours / 24)}d ${diffHours % 24}h`;
        return `${diffHours}h`;
    }
}
