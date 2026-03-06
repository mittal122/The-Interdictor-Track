export interface AiInsight {
    id: string;
    title: string;
    description: string;
    category: "security" | "cost" | "architecture" | "operational";
    severity: "high" | "medium" | "low";
    affectedResources: string[];
    recommendedAction: string;
}

/**
 * Removes duplicate or highly similar insights returned by the AI.
 * Focuses on identical titles or identical resource+category combinations.
 */
export function deduplicateInsights(insights: AiInsight[]): AiInsight[] {
    const unique = new Map<string, AiInsight>();

    for (const insight of insights) {
        // Create a signature to identify similar insights
        // For example, if two insights have the same title, or same category + affectedResources
        const resourceStr = [...(insight.affectedResources || [])].sort().join(',');
        const signature = `${insight.category}:${insight.title.slice(0, 15)}:${resourceStr}`;

        if (!unique.has(signature)) {
            unique.set(signature, insight);
        } else {
            // Keep the one with the higher severity if there's a collision
            const existing = unique.get(signature)!;
            if (getSeverityWeight(insight.severity) > getSeverityWeight(existing.severity)) {
                unique.set(signature, insight);
            }
        }
    }

    return Array.from(unique.values());
}

function getSeverityWeight(severity: string): number {
    switch (severity.toLowerCase()) {
        case 'high': return 3;
        case 'medium': return 2;
        case 'low': return 1;
        default: return 0;
    }
}
