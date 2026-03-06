/**
 * Extracts a JSON payload from a raw LLM text response.
 * Handles markdown formatting (e.g., ```json\n...\n```) and potential trailing text.
 */
export function validateAndParseAiResponse(rawText: string): any {
    try {
        let cleanText = rawText.trim();

        // Extract JSON using regex (matching ```json ... ```)
        const jsonMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch && jsonMatch[1]) {
            cleanText = jsonMatch[1].trim();
        } else {
            // Fallback: find the first { and last }
            const firstBrace = cleanText.indexOf('{');
            const lastBrace = cleanText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                cleanText = cleanText.substring(firstBrace, lastBrace + 1);
            }
        }

        // Try parsing the cleaned text
        const parsed = JSON.parse(cleanText);

        // Basic schema validation
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.insights)) {
            console.error("AI Response invalid schema - missing insights array:", parsed);
            return null;
        }

        return parsed;
    } catch (e) {
        console.error("Failed to parse AI response:", e, rawText);
        return null;
    }
}
