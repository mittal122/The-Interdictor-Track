/**
 * ARIA Chat Service
 * Conversational AI chatbot powered by NVIDIA NIM (Llama 3.1 8b instruct).
 * Maintains multi-turn conversation history and embeds live telemetry context.
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const NVIDIA_API_KEY = process.env.NVIDIA_NIM_API_KEY;
const NVIDIA_MODEL = process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.1-8b-instruct';

const nimClient = new OpenAI({
    apiKey: NVIDIA_API_KEY || 'not-set',
    baseURL: 'https://integrate.api.nvidia.com/v1',
});

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface TelemetryContext {
    globalHealth?: number;
    networkLatency?: number;
    cpuUsage?: number;
    memoryUsage?: number;
    activeAnomalies?: number;
    onlineNodesCount?: number;
    offlineNodesCount?: number;
    totalNodesCount?: number;
    nodes?: any[];
    storage?: any[];
}

export interface AriaChatResult {
    reply: string;
    model: string;
    latencyMs: number;
    isSimulated: boolean;
}

function buildSystemPrompt(telemetry?: TelemetryContext): string {
    const now = new Date().toISOString();

    const nodesList = telemetry?.nodes
        ? telemetry.nodes.map(n => `- ${n.name || n.id} (${n.type}) in ${n.region} — Status: **${n.status.toUpperCase()}**`).join('\n')
        : '';

    const storageList = telemetry?.storage
        ? telemetry.storage.map(s => `- ${s.name || s.id} (${s.sizeGB}GB) — Status: **${s.status.toUpperCase()}**`).join('\n')
        : '';

    const telemetryBlock = telemetry
        ? `
## Live Infrastructure Telemetry (as of ${now})
- Global Health Score: ${telemetry.globalHealth?.toFixed(1) ?? 'N/A'}%
- Network Latency: ${telemetry.networkLatency?.toFixed(0) ?? 'N/A'} ms
- CPU Usage: ${telemetry.cpuUsage?.toFixed(1) ?? 'N/A'}%
- Memory Usage: ${telemetry.memoryUsage?.toFixed(1) ?? 'N/A'}%
- Active Anomalies: ${telemetry.activeAnomalies ?? 0}
- Total Compute Nodes: ${telemetry.totalNodesCount ?? 'N/A'}
- Online Nodes: ${telemetry.onlineNodesCount ?? 'N/A'}
- Offline/Stopped Nodes: ${telemetry.offlineNodesCount ?? 0}

${nodesList ? '### Compute Nodes\n' + nodesList : ''}
${storageList ? '\n### Storage Volumes\n' + storageList : ''}
`
        : `\n## Live Telemetry: Not available (running in Demo mode)\n`;

    return `You are ARIA (Automated Response & Infrastructure Analyst), an expert AWS cloud infrastructure intelligence assistant built into the CloudScope platform. You help DevOps engineers, SREs, and cloud architects understand their AWS infrastructure in real time.

You have expertise in:
- AWS services (EC2, S3, RDS, Lambda, VPC, IAM, ELB, Route53, Auto Scaling, EBS, etc.)
- Cloud security best practices and threat detection
- Cost optimization and resource rightsizing
- Infrastructure reliability and incident response
- Terraform and Infrastructure as Code
- Orphan resource detection and cleanup

You always give clear, structured answers. You MUST strictly follow this exact 3-step approach for every response, using the exact bolded headers below:

**Step 1. Information Analysis:**
[State exactly what information is needed to answer the user's request]

**Step 2. Data Retrieval:**
[State the exact data you are pulling from the live telemetry above. DO NOT hallucinate data not present in the telemetry block.]

**Step 3. Final Response:**
[Provide the exact formatted answer based ON THAT DATA, using bullet points or numbered lists. Be concise, exact, and never give a generic "suggestion" if the user asked a specific question.]

Here is an example of a perfect response to "Which compute instances are online?":
**Step 1. Information Analysis:**
I need to check the status of all compute nodes to determine which ones are running.

**Step 2. Data Retrieval:**
Checking the telemetry block for onlineNodesCount and the specific node statuses.

**Step 3. Final Response:**
1. **app-server-1** (us-east-1a)
2. **db-primary** (us-east-1b)

You must use those exact three headers for every single response. Do not add any conversational text before Step 1.

${telemetryBlock}`;
}

const DEMO_RESPONSES: Record<string, string> = {
    default: `**Step 1. Information Analysis:**
I need to understand what specific infrastructure information the user is looking for (e.g., security, costs, health, or architecture).

**Step 2. Data Retrieval:**
Waiting for a specific user query to cross-reference against live telemetry nodes and events.

**Step 3. Final Response:**
I'm ARIA, your AWS infrastructure intelligence assistant. I can help you with:
- 🔍 **Security audits** — detecting open ports, over-permissive IAM policies, and exposed resources
- 💰 **Cost optimization** — identifying idle EC2 instances and orphaned EBS volumes
- 🏥 **Health analysis** — diagnosing anomalies, high CPU usage, and offline nodes

What would you like to know about your infrastructure?

*Note: AI responses are simulated because no NVIDIA NIM API key is configured. Add \`NVIDIA_NIM_API_KEY\` to your \`.env\` file for live AI responses.*`,
};

function getSimulatedReply(userMessage: string, telemetry?: TelemetryContext): string {
    const msg = userMessage.toLowerCase();

    // Extract dynamic telemetry data for accurate simulation
    const offlineNodes = telemetry?.nodes ? telemetry.nodes.filter(n => n.status !== 'running') : [];
    const onlineNodesCount = telemetry?.onlineNodesCount ?? 0;
    const offlineCount = telemetry?.offlineNodesCount ?? 0;
    const totalCount = telemetry?.totalNodesCount ?? 0;

    // Build a specific string naming the offline nodes if any exist
    const offlineDetails = offlineCount > 0
        ? `🔴 **${offlineCount} out of ${totalCount} nodes are currently OFFLINE (Stopped):**\n${offlineNodes.map(n => `   - ${n.name || n.id} in ${n.region}`).join('\n')}`
        : `✅ **All ${totalCount} nodes are ONLINE and running.**`;

    if (msg.includes('security') || msg.includes('risk') || msg.includes('vulnerab')) {
        return `**Step 1. Information Analysis:**
I need to identify the current security posture, potential vulnerabilities, and misconfigurations across the infrastructure.

**Step 2. Data Retrieval:**
Analyzing Security Groups, IAM Policies, EBS encryption status, and S3 bucket configurations from standard AWS checks.

**Step 3. Final Response:**
Based on typical AWS configurations, here are the most common security risks to check:
1. **Open Security Groups** — Inbound rules allowing \`0.0.0.0/0\` on ports 22 (SSH) or 3389 (RDP).
2. **Over-permissive IAM Policies** — Roles with \`AdministratorAccess\` or wildcard \`*\` actions.
3. **Unencrypted EBS Volumes** — Storage volumes without encryption at rest.
4. **Public S3 Buckets** — Any bucket with public ACLs or no bucket policy.

*This is a simulated response. Configure your NVIDIA NIM API key for real AI analysis.*`;
    }

    if (msg.includes('cost') || msg.includes('expen') || msg.includes('saving') || msg.includes('cheap')) {
        return `**Step 1. Information Analysis:**
I need to identify idle resources, unused capacity, and orphaned items that are incurring unnecessary AWS charges.

**Step 2. Data Retrieval:**
Analyzing EBS volume attachment states, Elastic IP associations, and EC2 instance statuses from the telemetry block.

**Step 3. Final Response:**
Here are the top areas to reduce your AWS spend:
1. **Orphaned EBS Volumes** — Volumes not attached to any EC2 instance still incur charges.
2. **Unassociated Elastic IPs** — AWS charges for EIPs not attached to a running instance.
3. **Stopped EC2 Instances** — Stopped instances don't incur compute costs, but attached EBS volumes still do.
4. **Idle Load Balancers** — ALBs/NLBs with no registered targets still cost ~$16/month.

*This is a simulated response. Configure your NVIDIA NIM API key for real AI analysis.*`;
    }

    if (msg.includes('orphan') || msg.includes('idle') || msg.includes('unused')) {
        return `**Step 1. Information Analysis:**
I need to find resources that are provisioned but not actively attached or utilized by any workloads.

**Step 2. Data Retrieval:**
Extracting storage arrays with \`status === 'available'\` and scanning for unassociated networking components.

**Step 3. Final Response:**
Resources that are wasting money or posing security risks:
- 🔴 **Orphaned EBS Volumes** — \`${telemetry?.storage?.filter(s => s.status === 'available').length || 0}\` EBS volumes in \`available\` state.
- 🟡 **Idle Security Groups** — Groups not attached to any EC2 instance.
- 🟡 **Unassociated Elastic IPs** — EIPs with no \`AssociationId\`.
- ⚪ **Empty Auto Scaling Groups** — ASGs with \`desiredCapacity: 0\`.

*This is a simulated response. Configure your NVIDIA NIM API key for real AI analysis.*`;
    }

    if (msg.includes('health') || msg.includes('status') || msg.includes('how is') || msg.includes('node') || msg.includes('online')) {
        return `**Step 1. Information Analysis:**
I need to check the overall health of the environment, including global health score, latency, CPU utilization, and specific node statuses.

**Step 2. Data Retrieval:**
Pulling \`globalHealth\`, \`networkLatency\`, \`cpuUsage\`, \`onlineNodesCount\`, and \`offlineNodesCount\` from the live telemetry snapshot.

**Step 3. Final Response:**
Here is the real-time status of your infrastructure:
- **Global Health:** ${telemetry?.globalHealth?.toFixed(1) ?? 'N/A'}%
- **Network Latency:** ${telemetry?.networkLatency?.toFixed(0) ?? 'N/A'}ms
- **CPU Usage:** ${telemetry?.cpuUsage?.toFixed(1) ?? 'N/A'}%

${offlineDetails}

*This is a simulated response. Configure your NVIDIA NIM API key for real AI analysis.*`;
    }

    return DEMO_RESPONSES.default;
}

function enforceThreeStepFormat(userMsg: string, aiResponse: string, telemetry?: TelemetryContext): string {
    // If the LLM miraculously followed the exact format, return it
    if (aiResponse.includes('**Step 1. Information Analysis:**') && aiResponse.includes('**Step 2. Data Retrieval:**') && aiResponse.includes('**Step 3. Final Response:**')) {
        // Strip conversational preamble before Step 1
        const step1Index = aiResponse.indexOf('**Step 1. Information Analysis:**');
        return aiResponse.substring(step1Index);
    }

    // Otherwise, forcefully reconstruct the answer
    const lowerMsg = userMsg.toLowerCase();

    let analysisText = "I need to analyze the current state of the infrastructure based on the user's query.";
    if (lowerMsg.includes('online') || lowerMsg.includes('offline') || lowerMsg.includes('status') || lowerMsg.includes('health')) {
        analysisText = "I need to check the overall health and online/offline status of all compute nodes in the environment.";
    } else if (lowerMsg.includes('security') || lowerMsg.includes('risk')) {
        analysisText = "I need to identify misconfigurations and potential security vulnerabilities across the AWS environment.";
    } else if (lowerMsg.includes('cost') || lowerMsg.includes('save') || lowerMsg.includes('money')) {
        analysisText = "I need to identify idle resources, unused capacity, and orphaned items that are incurring unnecessary AWS charges.";
    }

    let retrievalText = "Cross-referencing the query against the live infrastructure telemetry snapshot.";
    if (telemetry) {
        retrievalText = `Pulling data from live telemetry: Global Health [${telemetry.globalHealth}%], ${telemetry.onlineNodesCount} online nodes, ${telemetry.offlineNodesCount} offline nodes.`;
    }

    // Clean up the original AI response by removing its conversational filler
    let cleanResponse = aiResponse
        .replace(/^Based on the.*?,\s*/i, '')
        .replace(/^Here is the.*?:\s*/i, '')
        .replace(/^To check.*?:/i, '')
        .trim();

    // Capitalize the first letter if needed
    if (cleanResponse.length > 0) {
        cleanResponse = cleanResponse.charAt(0).toUpperCase() + cleanResponse.slice(1);
    }

    return `**Step 1. Information Analysis:**\n${analysisText}\n\n**Step 2. Data Retrieval:**\n${retrievalText}\n\n**Step 3. Final Response:**\n${cleanResponse}`;
}

export async function ariaChat(
    messages: ChatMessage[],
    telemetry?: TelemetryContext
): Promise<AriaChatResult> {
    const startMs = Date.now();
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';

    // Fallback: no API key configured
    if (!NVIDIA_API_KEY || NVIDIA_API_KEY === 'not-set' || NVIDIA_API_KEY.includes('nvapi-your-key-here')) {
        const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';
        await new Promise(res => setTimeout(res, 600 + Math.random() * 400)); // simulate latency
        return {
            reply: getSimulatedReply(lastUserMessage, telemetry),
            model: 'simulation',
            latencyMs: Date.now() - startMs,
            isSimulated: true,
        };
    }

    const systemPrompt = buildSystemPrompt(telemetry);

    const nimMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    try {
        const result = await nimClient.chat.completions.create({
            model: NVIDIA_MODEL,
            messages: nimMessages,
            temperature: 0.5,
            max_tokens: 1024,
        });

        const rawContent =
            result.choices[0]?.message?.content || 'I was unable to generate a response. Please try again.';

        // Programmatically enforce the 3-step format because the LLM will sometimes ignore prompt instructions
        const responseContent = enforceThreeStepFormat(lastUserMessage, rawContent, telemetry);

        console.log(`[ARIA Chat] Enforced final response content:\n${responseContent.substring(0, 100)}...`);

        return {
            reply: responseContent,
            model: result.model || NVIDIA_MODEL,
            latencyMs: Date.now() - startMs,
            isSimulated: false,
        };
    } catch (error: any) {
        console.error('[ARIA Chat] NIM API error:', error.message);
        // Fall back to simulation instead of crashing the endpoint
        const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
        return {
            reply: `⚠️ **AI connection issue** (${error.message || 'NIM API error'})\n\n${getSimulatedReply(lastUserMessage, telemetry)}`,
            model: 'simulation-fallback',
            latencyMs: Date.now() - startMs,
            isSimulated: true,
        };
    }
}
