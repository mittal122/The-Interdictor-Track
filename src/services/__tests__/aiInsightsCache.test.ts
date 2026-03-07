/**
 * Tests for AI Insights Cache
 * 
 * Validates caching, TTL expiration, and cache miss behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCachedInsights, setCachedInsights } from '../aiInsightsCache';
import type { AiInsight } from '../../utils/insightDeduplicator';

const mockInsights: AiInsight[] = [
    {
        id: 'ins-1',
        title: 'Over-provisioned EC2',
        description: 'Instance is using only 5% CPU',
        category: 'cost',
        severity: 'medium',
        affectedResources: ['i-123456'],
        recommendedAction: 'Downsize to t3.small',
    },
];

describe('AI Insights Cache', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns null for uncached key (cache miss)', () => {
        const result = getCachedInsights('nonexistent-key');
        expect(result).toBeNull();
    });

    it('stores and retrieves insights (cache hit)', () => {
        setCachedInsights('test-key', mockInsights);
        const result = getCachedInsights('test-key');
        expect(result).toEqual(mockInsights);
        expect(result).toHaveLength(1);
        expect(result![0].title).toBe('Over-provisioned EC2');
    });

    it('returns null after TTL expires (5 minutes)', () => {
        setCachedInsights('expiry-key', mockInsights);

        // Verify it exists
        expect(getCachedInsights('expiry-key')).not.toBeNull();

        // Advance time past TTL (5 min + 1 ms)
        vi.advanceTimersByTime(5 * 60 * 1000 + 1);

        // Should now be expired
        expect(getCachedInsights('expiry-key')).toBeNull();
    });

    it('returns insights within TTL window', () => {
        setCachedInsights('time-key', mockInsights);

        // Advance 4 minutes (within 5 min TTL)
        vi.advanceTimersByTime(4 * 60 * 1000);

        expect(getCachedInsights('time-key')).not.toBeNull();
    });

    it('handles multiple keys independently', () => {
        const insights2: AiInsight[] = [{
            id: 'ins-2',
            title: 'Unused EBS',
            description: 'Volume not attached',
            category: 'cost',
            severity: 'low',
            affectedResources: ['vol-abc'],
            recommendedAction: 'Delete or snapshot',
        }];

        setCachedInsights('key-a', mockInsights);
        setCachedInsights('key-b', insights2);

        expect(getCachedInsights('key-a')![0].title).toBe('Over-provisioned EC2');
        expect(getCachedInsights('key-b')![0].title).toBe('Unused EBS');
    });

    it('overwrites existing cache entry with same key', () => {
        setCachedInsights('overwrite-key', mockInsights);

        const updated: AiInsight[] = [{
            ...mockInsights[0],
            title: 'Updated Insight',
        }];
        setCachedInsights('overwrite-key', updated);

        expect(getCachedInsights('overwrite-key')![0].title).toBe('Updated Insight');
    });
});
