import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const NVIDIA_API_KEY = process.env.NVIDIA_NIM_API_KEY;
const NVIDIA_MODEL = process.env.NVIDIA_NIM_MODEL || "openai/gpt-oss-120b";

const nimClient = new OpenAI({
    apiKey: NVIDIA_API_KEY || "not-set",
    baseURL: "https://integrate.api.nvidia.com/v1",
});

const hasValidKey = !!NVIDIA_API_KEY && !NVIDIA_API_KEY.includes("nvapi-your-key-here");

// ── Types ─────────────────────────────────────────────────────────────────
export interface TopologyResource {
    id: string;
    type: string;
    name: string;
    category: string;
    parentId?: string;    // e.g. VPC id for subnets, subnet id for EC2s
}

export interface TopologyConnection {
    from: string;
    to: string;
    label: string;
}

export interface TopologyPayload {
    resources: TopologyResource[];
    connections: TopologyConnection[];
}

export interface LayoutNodePosition {
    id: string;
    x: number;
    y: number;
    section: string;
}

export interface LayoutSection {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface LayoutPlan {
    nodes: LayoutNodePosition[];
    sections: LayoutSection[];
    isAIGenerated: boolean;
}

// ── AI System Prompt ──────────────────────────────────────────────────────
function buildLayoutSystemPrompt(): string {
    return `You are an infrastructure visualization planner.

Your task is to organize AWS resources into a clean vertical architecture diagram.

Rules:
- Build the layout vertically from top to bottom.
- Resources connected together should be grouped into the same section.
- If a resource connects multiple sections, create a parent section containing them.
- Resources with no connections should be placed in an "Unconnected Resources" section.
- Ensure enough spacing between nodes so labels and connection names remain visible. Use at least 200px horizontal spacing and 180px vertical spacing between nodes.
- Avoid overlapping edges.
- Return node positions for a readable architecture layout.

Section ordering from top to bottom:
1. VPCs at the very top (y: 0-100)
2. Subnets, Gateways, Route Tables (y: 250-500)
3. Compute instances (EC2, Lambda, ELB) (y: 600-900)
4. Storage and Database (EBS, S3, RDS) (y: 1000-1200)
5. Security and Identity (Security Groups, IAM) (y: 1300-1500)
6. Unconnected Resources at the bottom

Canvas size: 1600px wide, as tall as needed.
Place sections starting at x=50.
Each section should be wide enough to contain all its nodes with 40px padding.

Return ONLY a raw JSON object (no markdown, no code fences) with this exact structure:
{
  "sections": [{ "name": "Section Name", "x": 0, "y": 0, "width": 800, "height": 400 }],
  "nodes": [{ "id": "resource-id", "x": 100, "y": 200, "section": "Section Name" }]
}`;
}

// ── Topology Normalizer ───────────────────────────────────────────────────
export function normalizeTopology(infraData: any): TopologyPayload {
    const resources: TopologyResource[] = [];
    const connections: TopologyConnection[] = [];

    if (!infraData?.nodes || !infraData?.edges) {
        return { resources, connections };
    }

    for (const node of infraData.nodes) {
        let parentId: string | undefined;
        if (node.type === "subnet" && node.meta?.vpcId) {
            parentId = `vpc-${node.region}-${node.meta.vpcId}`;
        } else if (node.meta?.subnetId) {
            parentId = `subnet-${node.region}-${node.meta.subnetId}`;
        } else if (node.meta?.vpcId && node.type !== "vpc") {
            parentId = `vpc-${node.region}-${node.meta.vpcId}`;
        }

        resources.push({
            id: node.id,
            type: node.type,
            name: node.name,
            category: node.category,
            parentId,
        });
    }

    for (const edge of infraData.edges) {
        connections.push({
            from: edge.source,
            to: edge.target,
            label: edge.label,
        });
    }

    return { resources, connections };
}

// ── Deterministic Fallback Layout ─────────────────────────────────────────
// Always works — no AI needed. Computes a clean vertical tiered layout.
function computeFallbackLayout(topology: TopologyPayload): LayoutPlan {
    const tierMap: Record<string, number> = {
        vpc: 0,
        subnet: 1, igw: 1, nat: 1, "route-table": 1,
        elb: 2, "target-group": 2, ec2: 3, lambda: 3, "auto-scaling": 3,
        ebs: 4, s3: 4, rds: 4,
        sg: 5, iam: 5, "iam-role": 5, "iam-user": 5, "iam-policy": 5,
        eip: 6, route53: 6,
    };

    const TIER_Y_START = [0, 280, 560, 840, 1120, 1400, 1680];
    const NODE_W = 180;
    const NODE_H = 110;
    const H_GAP = 220;
    const V_PAD = 60;
    const SECTION_PAD = 40;

    // Group resources by tier
    const tiers: Record<number, TopologyResource[]> = {};
    for (const r of topology.resources) {
        const tier = tierMap[r.type] ?? 7; // unknown → bottom
        if (!tiers[tier]) tiers[tier] = [];
        tiers[tier].push(r);
    }

    const TIER_LABELS = [
        "VPCs", "Networking Layer", "Load Balancing",
        "Compute Layer", "Storage & Database", "Security & Identity",
        "Other Resources", "Unconnected"
    ];

    const nodes: LayoutNodePosition[] = [];
    const sections: LayoutSection[] = [];

    let globalMaxWidth = 0;
    const sortedTiers = Object.keys(tiers).map(Number).sort((a, b) => a - b);

    // Compute cumulative Y positions (stack tiers vertically based on content)
    let cumulativeY = 0;
    const tierYPositions: Record<number, number> = {};

    for (const tierIdx of sortedTiers) {
        tierYPositions[tierIdx] = cumulativeY;
        const count = tiers[tierIdx].length;
        const rows = Math.ceil(count / 6); // max 6 nodes per row
        const tierHeight = rows * (NODE_H + V_PAD) + 80; // 80 for section header
        cumulativeY += tierHeight + 40; // gap between sections
    }

    for (const tierIdx of sortedTiers) {
        const tierResources = tiers[tierIdx];
        const baseY = tierYPositions[tierIdx];
        const maxCols = Math.min(tierResources.length, 6);

        tierResources.forEach((r, i) => {
            const col = i % 6;
            const row = Math.floor(i / 6);
            const x = SECTION_PAD + col * H_GAP;
            const y = baseY + 60 + row * (NODE_H + V_PAD); // 60 for section header

            nodes.push({ id: r.id, x, y, section: TIER_LABELS[tierIdx] || "Other" });
        });

        const rows = Math.ceil(tierResources.length / 6);
        const sectionWidth = Math.max(maxCols * H_GAP + SECTION_PAD * 2, 400);
        const sectionHeight = rows * (NODE_H + V_PAD) + 80;

        if (sectionWidth > globalMaxWidth) globalMaxWidth = sectionWidth;

        sections.push({
            name: TIER_LABELS[tierIdx] || "Other",
            x: 0,
            y: baseY,
            width: sectionWidth,
            height: sectionHeight,
        });
    }

    // Normalize all sections to the same width
    for (const s of sections) {
        s.width = Math.max(globalMaxWidth, 1400);
    }

    return { nodes, sections, isAIGenerated: false };
}

// ── Main Entry Point ──────────────────────────────────────────────────────
export async function generateLayout(infraData: any): Promise<LayoutPlan> {
    const topology = normalizeTopology(infraData);

    if (topology.resources.length === 0) {
        return { nodes: [], sections: [], isAIGenerated: false };
    }

    // If no valid NVIDIA key, use deterministic fallback immediately
    if (!hasValidKey) {
        console.log("📐 Layout Planner: Using deterministic fallback (no NVIDIA key)");
        return computeFallbackLayout(topology);
    }

    try {
        console.log(`📐 Layout Planner: Sending ${topology.resources.length} resources to NVIDIA NIM...`);
        const startTime = Date.now();

        const userPrompt = `Here is the AWS infrastructure topology to layout:\n\n${JSON.stringify(topology, null, 2)}\n\nGenerate a clean vertical layout plan. Return ONLY raw JSON.`;

        const stream = await nimClient.chat.completions.create({
            model: NVIDIA_MODEL,
            messages: [
                { role: "system", content: buildLayoutSystemPrompt() },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.3,
            top_p: 1,
            max_tokens: 8192,
            stream: true,
        });

        let fullText = "";
        for await (const chunk of stream) {
            if (!chunk.choices || chunk.choices.length === 0) continue;
            const delta = chunk.choices[0].delta;
            const reasoning = (delta as any).reasoning_content;
            if (reasoning) continue;
            if (delta.content) fullText += delta.content;
        }

        const latencyMs = Date.now() - startTime;
        console.log(`📐 Layout Planner: AI response received in ${latencyMs}ms`);

        // Parse the AI JSON response
        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn("📐 Layout Planner: AI returned non-JSON. Falling back to deterministic.");
            return computeFallbackLayout(topology);
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // Validate structure
        if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.sections)) {
            console.warn("📐 Layout Planner: AI JSON missing nodes/sections. Falling back.");
            return computeFallbackLayout(topology);
        }

        // Validate all resource IDs are accounted for
        const aiNodeIds = new Set(parsed.nodes.map((n: any) => n.id));
        const missingNodes: LayoutNodePosition[] = [];
        let maxY = Math.max(...parsed.nodes.map((n: any) => n.y || 0), 0);

        for (const r of topology.resources) {
            if (!aiNodeIds.has(r.id)) {
                maxY += 150;
                missingNodes.push({ id: r.id, x: 50, y: maxY, section: "Unplaced by AI" });
            }
        }

        if (missingNodes.length > 0) {
            parsed.nodes.push(...missingNodes);
            parsed.sections.push({
                name: "Unplaced by AI",
                x: 0, y: maxY - 50,
                width: 1400, height: missingNodes.length * 150 + 100
            });
        }

        return {
            nodes: parsed.nodes,
            sections: parsed.sections,
            isAIGenerated: true,
        };

    } catch (error: any) {
        console.error("📐 Layout Planner: NVIDIA NIM API Error:", error?.message);
        console.log("📐 Layout Planner: Falling back to deterministic layout.");
        return computeFallbackLayout(topology);
    }
}
