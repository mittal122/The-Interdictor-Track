/**
 * Quick diagnostic script to test all AI API integrations.
 * Run: npx tsx test-nim.ts
 */
import dotenv from "dotenv";
dotenv.config();

const NVIDIA_API_KEY = process.env.NVIDIA_NIM_API_KEY;
const NVIDIA_MODEL = process.env.NVIDIA_NIM_MODEL || "meta/llama-3.1-405b-instruct";

console.log("═══════════════════════════════════════════════════");
console.log("  INTERDICTOR TRACK — AI API DIAGNOSTIC TEST");
console.log("═══════════════════════════════════════════════════\n");

// ── 1. Check environment variables ──────────────────────────────────────
console.log("1️⃣  ENVIRONMENT CHECK");
console.log(`   NVIDIA_NIM_API_KEY: ${NVIDIA_API_KEY ? `SET (${NVIDIA_API_KEY.slice(0, 12)}...${NVIDIA_API_KEY.slice(-4)})` : "❌ NOT SET"}`);
console.log(`   NVIDIA_NIM_MODEL:   ${NVIDIA_MODEL}`);
console.log("");

if (!NVIDIA_API_KEY) {
    console.log("❌ NVIDIA_NIM_API_KEY is not set. All NIM features will run in simulation mode.");
    process.exit(1);
}

// ── 2. Test NVIDIA NIM API endpoint ─────────────────────────────────────
console.log("2️⃣  NVIDIA NIM API TEST");
console.log(`   Endpoint: https://integrate.api.nvidia.com/v1/chat/completions`);
console.log(`   Model:    ${NVIDIA_MODEL}`);
console.log(`   Sending test prompt...\n`);

async function testNvidiaApi() {
    try {
        const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${NVIDIA_API_KEY}`,
            },
            body: JSON.stringify({
                model: NVIDIA_MODEL,
                messages: [{ role: "user", content: "Reply with exactly: NVIDIA NIM ONLINE" }],
                max_tokens: 20,
                temperature: 0.1,
            }),
        });

        console.log(`   HTTP Status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorBody = await response.text();
            console.log(`   ❌ FAILED — Response body:`);
            console.log(`   ${errorBody.slice(0, 500)}`);
            return false;
        }

        const data = await response.json() as any;
        const reply = data.choices?.[0]?.message?.content || "(no content)";
        console.log(`   ✅ SUCCESS — AI replied: "${reply.trim()}"`);
        console.log(`   Model used: ${data.model || "unknown"}`);
        console.log(`   Tokens: prompt=${data.usage?.prompt_tokens}, completion=${data.usage?.completion_tokens}`);
        return true;
    } catch (err: any) {
        console.log(`   ❌ NETWORK ERROR: ${err.message}`);
        return false;
    }
}

// ── 3. Test NVIDIA NIM with the models list endpoint ────────────────────
async function testModelsEndpoint() {
    console.log("\n3️⃣  NVIDIA NIM MODELS ENDPOINT TEST");
    console.log(`   Endpoint: https://integrate.api.nvidia.com/v1/models`);
    try {
        const response = await fetch("https://integrate.api.nvidia.com/v1/models", {
            headers: { "Authorization": `Bearer ${NVIDIA_API_KEY}` },
        });
        console.log(`   HTTP Status: ${response.status} ${response.statusText}`);
        if (response.ok) {
            const data = await response.json() as any;
            const modelIds = (data.data || []).map((m: any) => m.id).slice(0, 10);
            console.log(`   ✅ Available models (first 10): ${modelIds.join(", ")}`);
            const targetModel = (data.data || []).find((m: any) => m.id === NVIDIA_MODEL);
            if (targetModel) {
                console.log(`   ✅ Your model "${NVIDIA_MODEL}" IS available.`);
            } else {
                console.log(`   ⚠️  Your model "${NVIDIA_MODEL}" was NOT found in the available models list.`);
            }
        } else {
            const errorBody = await response.text();
            console.log(`   ❌ FAILED: ${errorBody.slice(0, 300)}`);
        }
    } catch (err: any) {
        console.log(`   ❌ NETWORK ERROR: ${err.message}`);
    }
}

// ── 4. Summary of all services that depend on NIM ───────────────────────
function printServiceSummary(nimWorking: boolean) {
    console.log("\n═══════════════════════════════════════════════════");
    console.log("  SERVICE STATUS SUMMARY");
    console.log("═══════════════════════════════════════════════════\n");

    const services = [
        { name: "NIM AI Analyst (nimAnalystService)", desc: "Analyzes telemetry data for anomalies", usesNim: true },
        { name: "AI Infrastructure Analyst (aiAnalystService)", desc: "Scans live infra for security/cost/arch issues", usesNim: true },
        { name: "ARIA Chatbot (ariaChatService)", desc: "Conversational cloud advisor", usesNim: true },
        { name: "AI Graph Layout (nimLayoutService)", desc: "AI-powered diagram node arrangement", usesNim: true },
        { name: "Cost Estimation (costEstimationService)", desc: "Resource cost estimation", usesNim: false },
        { name: "Terraform Export (terraformExportService)", desc: "Reverse Terraform code generation", usesNim: false },
        { name: "Telemetry Service (telemetryService)", desc: "Real-time AWS metrics", usesNim: false },
        { name: "AWS Infrastructure Engine", desc: "Full account resource discovery", usesNim: false },
    ];

    for (const svc of services) {
        const status = svc.usesNim
            ? (nimWorking ? "✅ LIVE" : "⚠️  SIMULATION MODE")
            : "✅ WORKS (no AI needed)";
        console.log(`   ${status}  ${svc.name}`);
        console.log(`              ${svc.desc}`);
    }

    console.log("\n═══════════════════════════════════════════════════\n");
}

// ── Run all tests ───────────────────────────────────────────────────────
(async () => {
    const nimOk = await testNvidiaApi();
    await testModelsEndpoint();
    printServiceSummary(nimOk);
})();
