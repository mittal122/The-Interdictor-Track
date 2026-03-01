import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { GetCostAndUsageCommand, CostExplorerClient } from "@aws-sdk/client-cost-explorer";
import dotenv from "dotenv";

dotenv.config();

const hasAwsCredentials = !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION || "us-east-1";

let ec2Client: EC2Client | null = null;
let ceClient: CostExplorerClient | null = null;

if (hasAwsCredentials) {
    ec2Client = new EC2Client({ region });
    ceClient = new CostExplorerClient({ region });
    console.log("🌩️  AWS Integration Active: Credentials detected.");
} else {
    console.log("☁️  AWS Integration Offline: Using robust simulation fallback. (Add AWS keys to .env to integrate real EC2 data)");
}

export class AwsIntegrationService {
    /**
     * Fetches real EC2 instances if credentials exist, otherwise returns null 
     * (so telemetry service can fallback to simulation).
     */
    async getComputeNodes() {
        if (!ec2Client) return null;

        try {
            const command = new DescribeInstancesCommand({});
            const response = await ec2Client.send(command);

            const nodes: any[] = [];

            response.Reservations?.forEach(res => {
                res.Instances?.forEach(inst => {
                    // Extract Name tag
                    const nameTag = inst.Tags?.find(t => t.Key === 'Name')?.Value || inst.InstanceId;

                    nodes.push({
                        id: nameTag,
                        instanceId: inst.InstanceId,
                        region: inst.Placement?.AvailabilityZone || region,
                        type: inst.InstanceType,
                        status: inst.State?.Name === 'running' ? 'running' : 'stopped',
                        // Mock CPU/Mem for now as real metrics require CloudWatch calls per instance
                        cpu: inst.State?.Name === 'running' ? Math.floor(Math.random() * 60) + 10 : 0,
                        memory: inst.State?.Name === 'running' ? Math.floor(Math.random() * 50) + 20 : 0,
                        uptime: inst.LaunchTime ? this.getUptime(inst.LaunchTime) : "0h",
                        rack: "AWS-CLOUD"
                    });
                });
            });

            return nodes;
        } catch (error) {
            console.error("AWS EC2 Fetch Error:", error);
            return null;
        }
    }

    /**
     * Fetches real AWS billing data for the current month if credentials exist.
     */
    async getBillingData() {
        if (!ceClient) return null;

        try {
            const end = new Date();
            const start = new Date(end.getFullYear(), end.getMonth(), 1);

            const command = new GetCostAndUsageCommand({
                TimePeriod: {
                    Start: start.toISOString().split('T')[0],
                    End: end.toISOString().split('T')[0]
                },
                Granularity: "MONTHLY",
                Metrics: ["UnblendedCost"]
            });

            const res = await ceClient.send(command);
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
