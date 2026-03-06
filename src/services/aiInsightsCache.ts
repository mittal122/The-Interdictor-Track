import { AiInsight } from '../utils/insightDeduplicator';

interface CacheEntry {
    timestamp: number;
    insights: AiInsight[];
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const insightCache = new Map<string, CacheEntry>();

export function getCachedInsights(key: string): AiInsight[] | null {
    const entry = insightCache.get(key);
    if (!entry) return null;

    // Check expiration
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        insightCache.delete(key);
        return null;
    }

    return entry.insights;
}

export function setCachedInsights(key: string, insights: AiInsight[]): void {
    insightCache.set(key, {
        timestamp: Date.now(),
        insights
    });
}
