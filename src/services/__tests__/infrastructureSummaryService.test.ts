/**
 * Tests for Infrastructure Summary Service
 * 
 * Validates resource counting, relationship extraction, and edge cases.
 */
import { describe, it, expect } from 'vitest';
import { generateInfrastructureSummary } from '../infrastructureSummaryService';
import type { InfraMap, InfraNode, InfraEdge } from '../awsInfrastructureEngine';

function makeNode(overrides: Partial<InfraNode>): InfraNode {
    return {
        id: 'node-1',
        type: 'ec2',
        category: 'compute',
        name: 'Test Node',
        region: 'us-east-1',
        status: 'active',
        meta: {},
        ...overrides,
    };
}

function makeInfraMap(nodes: InfraNode[], edges: InfraEdge[] = []): InfraMap {
    return {
        nodes,
        edges,
        summary: { totalResources: nodes.length, activeCount: 0, stoppedCount: 0, orphanCount: 0, idleCount: 0, regionCount: 1, serviceTypes: [] },
        fetchedAt: Date.now(),
    };
}

describe('Infrastructure Summary Service', () => {
    describe('Resource counting', () => {
        it('counts VPCs correctly', () => {
            const map = makeInfraMap([
                makeNode({ id: 'vpc-1', type: 'vpc' }),
                makeNode({ id: 'vpc-2', type: 'vpc' }),
            ]);
            const summary = generateInfrastructureSummary(map);
            expect(summary.counts.vpcs).toBe(2);
        });

        it('counts EC2 instances and stopped instances separately', () => {
            const map = makeInfraMap([
                makeNode({ id: 'ec2-1', type: 'ec2', status: 'active' }),
                makeNode({ id: 'ec2-2', type: 'ec2', status: 'stopped' }),
                makeNode({ id: 'ec2-3', type: 'ec2', status: 'active' }),
            ]);
            const summary = generateInfrastructureSummary(map);
            expect(summary.counts.ec2Instances).toBe(3);
            expect(summary.counts.stoppedInstances).toBe(1);
        });

        it('distinguishes public and private subnets', () => {
            const map = makeInfraMap([
                makeNode({ id: 'sub-1', type: 'subnet', meta: { type: 'public' } }),
                makeNode({ id: 'sub-2', type: 'subnet', meta: { type: 'private' } }),
                makeNode({ id: 'sub-3', type: 'subnet', meta: { type: 'private' } }),
            ]);
            const summary = generateInfrastructureSummary(map);
            expect(summary.counts.publicSubnets).toBe(1);
            expect(summary.counts.privateSubnets).toBe(2);
        });

        it('counts unique regions', () => {
            const map = makeInfraMap([
                makeNode({ id: 'ec2-1', region: 'us-east-1' }),
                makeNode({ id: 'ec2-2', region: 'us-east-1' }),
                makeNode({ id: 'ec2-3', region: 'eu-west-1' }),
            ]);
            const summary = generateInfrastructureSummary(map);
            expect(summary.counts.regions).toBe(2);
        });

        it('identifies orphaned EBS volumes', () => {
            const map = makeInfraMap([
                makeNode({ id: 'ebs-1', type: 'ebs', status: 'orphan' }),
                makeNode({ id: 'ebs-2', type: 'ebs', status: 'active' }),
            ]);
            const summary = generateInfrastructureSummary(map);
            expect(summary.counts.unusedVolumes).toBe(1);
        });

        it('identifies open security groups', () => {
            const map = makeInfraMap([
                makeNode({ id: 'sg-1', type: 'sg', meta: { rules: '0.0.0.0/0' } }),
                makeNode({ id: 'sg-2', type: 'sg', meta: { rules: '10.0.0.0/8' } }),
            ]);
            const summary = generateInfrastructureSummary(map);
            expect(summary.counts.openSecurityGroups).toBe(1);
        });
    });

    describe('Relationship extraction', () => {
        it('extracts EC2 -> RDS relationships', () => {
            const nodes = [
                makeNode({ id: 'ec2-1', type: 'ec2' }),
                makeNode({ id: 'rds-1', type: 'rds' }),
            ];
            const edges: InfraEdge[] = [
                { source: 'ec2-1', target: 'rds-1', label: 'connects-to' },
            ];
            const summary = generateInfrastructureSummary(makeInfraMap(nodes, edges));
            expect(summary.relationships).toHaveLength(1);
            expect(summary.relationships[0]).toContain('EC2 -> RDS');
            expect(summary.relationships[0]).toContain('1 connections');
        });

        it('counts multiple connections of the same type', () => {
            const nodes = [
                makeNode({ id: 'ec2-1', type: 'ec2' }),
                makeNode({ id: 'ec2-2', type: 'ec2' }),
                makeNode({ id: 'rds-1', type: 'rds' }),
            ];
            const edges: InfraEdge[] = [
                { source: 'ec2-1', target: 'rds-1', label: 'connects-to' },
                { source: 'ec2-2', target: 'rds-1', label: 'connects-to' },
            ];
            const summary = generateInfrastructureSummary(makeInfraMap(nodes, edges));
            expect(summary.relationships[0]).toContain('2 connections');
        });

        it('filters out non-core relationships (e.g., VPC -> Subnet)', () => {
            const nodes = [
                makeNode({ id: 'vpc-1', type: 'vpc' }),
                makeNode({ id: 'sub-1', type: 'subnet' }),
            ];
            const edges: InfraEdge[] = [
                { source: 'vpc-1', target: 'sub-1', label: 'contains' },
            ];
            const summary = generateInfrastructureSummary(makeInfraMap(nodes, edges));
            // VPC and Subnet are not in the core types list
            expect(summary.relationships).toHaveLength(0);
        });
    });

    describe('Edge cases', () => {
        it('handles empty infrastructure map', () => {
            const summary = generateInfrastructureSummary(makeInfraMap([]));
            expect(summary.counts.ec2Instances).toBe(0);
            expect(summary.counts.regions).toBe(0);
            expect(summary.relationships).toHaveLength(0);
        });
    });
});
