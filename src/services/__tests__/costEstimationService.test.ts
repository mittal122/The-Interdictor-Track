/**
 * Tests for Cost Estimation Service
 * 
 * Validates pricing calculations for EC2, RDS, EBS, Lambda, NAT, ELB, EIP, S3
 * and waste detection for orphaned/idle resources.
 */
import { describe, it, expect } from 'vitest';
import { estimateCosts } from '../costEstimationService';

// Helper to create a minimal InfraMap with given nodes
function makeInfraMap(nodes: any[]) {
    return {
        nodes,
        edges: [],
        summary: { totalResources: nodes.length, activeCount: 0, stoppedCount: 0, orphanCount: 0, idleCount: 0, regionCount: 1, serviceTypes: [] },
        fetchedAt: Date.now(),
    };
}

function makeNode(overrides: Partial<any>) {
    return {
        id: 'test-1',
        type: 'ec2',
        category: 'compute',
        name: 'Test Node',
        region: 'us-east-1',
        status: 'active',
        meta: {},
        ...overrides,
    };
}

describe('Cost Estimation Service', () => {
    describe('EC2 pricing', () => {
        it('calculates running t3.micro cost correctly', () => {
            const map = makeInfraMap([makeNode({ type: 'ec2', meta: { instanceType: 't3.micro' } })]);
            const result = estimateCosts(map);
            // t3.micro = $0.0104/hr * 730 hrs = $7.59
            expect(result.totalMonthly).toBeCloseTo(7.59, 1);
            expect(result.byResource[0].isWasted).toBe(false);
        });

        it('reports zero cost for stopped EC2 instances', () => {
            const map = makeInfraMap([makeNode({ type: 'ec2', status: 'stopped', meta: { instanceType: 't3.large' } })]);
            const result = estimateCosts(map);
            expect(result.totalMonthly).toBe(0);
        });

        it('flags idle EC2 instances as wasted', () => {
            const map = makeInfraMap([makeNode({ type: 'ec2', status: 'idle', meta: { instanceType: 't3.medium' } })]);
            const result = estimateCosts(map);
            expect(result.wastedResources).toHaveLength(1);
            expect(result.wastedResources[0].wasteReason).toContain('idle');
        });

        it('falls back to default pricing for unknown instance type', () => {
            const map = makeInfraMap([makeNode({ type: 'ec2', meta: { instanceType: 'z99.superlarge' } })]);
            const result = estimateCosts(map);
            // Default: $0.0416/hr * 730 = $30.37
            expect(result.totalMonthly).toBeCloseTo(30.37, 0);
        });
    });

    describe('EBS pricing', () => {
        it('calculates 100GB EBS volume cost', () => {
            const map = makeInfraMap([makeNode({ type: 'ebs', meta: { size: 100, volumeType: 'gp3' } })]);
            const result = estimateCosts(map);
            // 100 * $0.10 = $10
            expect(result.totalMonthly).toBe(10);
        });

        it('flags orphan EBS volumes as wasted', () => {
            const map = makeInfraMap([makeNode({ type: 'ebs', status: 'orphan', meta: { size: 50, state: 'available' } })]);
            const result = estimateCosts(map);
            expect(result.wastedResources).toHaveLength(1);
            expect(result.wastedResources[0].wasteReason).toContain('Unattached');
        });
    });

    describe('EIP pricing', () => {
        it('charges for unassociated EIPs', () => {
            const map = makeInfraMap([makeNode({ type: 'eip', status: 'orphan', meta: {} })]);
            const result = estimateCosts(map);
            // $0.005/hr * 730 = $3.65
            expect(result.totalMonthly).toBeCloseTo(3.65, 1);
            expect(result.wastedResources).toHaveLength(1);
        });

        it('reports zero cost for associated EIPs', () => {
            const map = makeInfraMap([makeNode({ type: 'eip', status: 'active', meta: { associationId: 'eipassoc-123' } })]);
            const result = estimateCosts(map);
            expect(result.totalMonthly).toBe(0);
        });
    });

    describe('Aggregation', () => {
        it('groups costs by service correctly', () => {
            const nodes = [
                makeNode({ id: 'ec2-1', type: 'ec2', meta: { instanceType: 't3.micro' } }),
                makeNode({ id: 'ec2-2', type: 'ec2', meta: { instanceType: 't3.micro' } }),
                makeNode({ id: 'ebs-1', type: 'ebs', meta: { size: 100 } }),
            ];
            const result = estimateCosts(makeInfraMap(nodes));
            const ec2Service = result.byService.find(s => s.service === 'EC2');
            expect(ec2Service).toBeDefined();
            expect(ec2Service!.count).toBe(2);
        });

        it('groups costs by region correctly', () => {
            const nodes = [
                makeNode({ id: 'ec2-1', type: 'ec2', region: 'us-east-1', meta: { instanceType: 't3.micro' } }),
                makeNode({ id: 'ec2-2', type: 'ec2', region: 'eu-west-1', meta: { instanceType: 't3.micro' } }),
            ];
            const result = estimateCosts(makeInfraMap(nodes));
            expect(result.byRegion).toHaveLength(2);
        });

        it('returns top cost drivers sorted descending', () => {
            const nodes = [
                makeNode({ id: 'ec2-1', type: 'ec2', meta: { instanceType: 't3.micro' } }),
                makeNode({ id: 'ec2-2', type: 'ec2', meta: { instanceType: 'm5.4xlarge' } }),
            ];
            const result = estimateCosts(makeInfraMap(nodes));
            expect(result.topDrivers[0].type).toBe('ec2');
            // m5.4xlarge should be the most expensive
            expect(result.topDrivers[0].monthlyEstimate).toBeGreaterThan(result.topDrivers[1].monthlyEstimate);
        });

        it('returns proper currency and disclaimer', () => {
            const result = estimateCosts(makeInfraMap([]));
            expect(result.currency).toBe('USD');
            expect(result.disclaimer).toContain('approximate');
        });
    });
});
