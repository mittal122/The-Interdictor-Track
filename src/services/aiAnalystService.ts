import OpenAI from 'openai';
import dotenv from 'dotenv';
import { generateInfrastructureSummary } from './infrastructureSummaryService';
import { validateAndParseAiResponse } from '../utils/aiResponseValidator';
import { deduplicateInsights, AiInsight } from '../utils/insightDeduplicator';
import { InfraMap } from './awsInfrastructureEngine';

dotenv.config();

const NVIDIA_API_KEY = process.env.NVIDIA_NIM_API_KEY;
const NVIDIA_MODEL = process.env.NVIDIA_NIM_MODEL || "openai/gpt-oss-120b";

const nimClient = new OpenAI({
  apiKey: NVIDIA_API_KEY || "not-set",
  baseURL: "https://integrate.api.nvidia.com/v1",
});

export async function analyzeInfrastructure(data: InfraMap): Promise<AiInsight[]> {
  const summary = generateInfrastructureSummary(data);

  const prompt = `
You are a senior cloud architecture expert.

Analyze the following AWS infrastructure summary.

Identify:
- security risks
- cost inefficiencies
- architecture weaknesses
- operational risks

Return insights in structured JSON format exactly matching the schema below:

{
  "insights": [
    {
      "id": "unique-string-id",
      "title": "Short descriptive title",
      "description": "Detailed explanation of the issue.",
      "category": "security|cost|architecture|operational",
      "severity": "high|medium|low",
      "affectedResources": ["resource_id_if_known_or_applicable"],
      "recommendedAction": "Actionable step to fix the issue."
    }
  ]
}

Only return JSON. Do not include introductory text or markdown formatting outside of the JSON block.

### Infrastructure Summary
\`\`\`json
${JSON.stringify(summary, null, 2)}
\`\`\`
`;

  if (!NVIDIA_API_KEY || NVIDIA_API_KEY.includes("nvapi-your-key-here")) {
    console.warn("NVIDIA NIM Offline: Falling back to mocked insights.");
    return [
      {
        id: "mock-insight-1",
        title: "NVIDIA API Key Missing",
        description: "The NVIDIA_NIM_API_KEY environment variable is not set. Add it to .env to enable real AI insights.",
        category: "operational",
        severity: "high",
        affectedResources: [],
        recommendedAction: "Add your NVIDIA NIM API key to the .env file in the root directory."
      }
    ];
  }

  try {
    const result = await nimClient.chat.completions.create({
      model: NVIDIA_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2, // Low temperature for more deterministic JSON
      max_tokens: 4096,
    });

    const responseMessage = result.choices[0]?.message;
    const responseText = responseMessage?.content || (responseMessage as any)?.reasoning_content || "";

    const parsedResult = validateAndParseAiResponse(responseText);

    if (!parsedResult || !parsedResult.insights) {
      console.error("Failed to parse valid insights from AI response.");
      return [];
    }

    const validInsights: AiInsight[] = parsedResult.insights.filter((i: any) =>
      i.title && i.description && i.category && i.severity
    );

    return deduplicateInsights(validInsights);

  } catch (error) {
    console.error("AI Analysis failed:", error);
    throw error;
  }
}
