/**
 * Tests for Terraform Export Service
 * 
 * Validates HCL output structure, resource generation, and variable/output files.
 */
import { describe, it, expect } from 'vitest';
import { generateTerraform } from '../terraformExportService';

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

function makeInfraMap(nodes: any[]) {
    return {
        nodes,
        edges: [],
        summary: { totalResources: nodes.length },
        fetchedAt: Date.now(),
    };
}

describe('Terraform Export Service', () => {
    describe('File structure', () => {
        it('generates all 4 terraform files', () => {
            const map = makeInfraMap([makeNode({ type: 'vpc', meta: { vpcId: 'vpc-123', cidr: '10.0.0.0/16' } })]);
            const result = generateTerraform(map);

            expect(result.files).toHaveLength(4);
            const names = result.files.map(f => f.name);
            expect(names).toContain('provider.tf');
            expect(names).toContain('variables.tf');
            expect(names).toContain('main.tf');
            expect(names).toContain('outputs.tf');
        });

        it('reports supported resource types', () => {
            const result = generateTerraform(makeInfraMap([makeNode({ type: 'vpc', meta: { vpcId: 'vpc-1', cidr: '10.0.0.0/16' } })]));
            expect(result.supportedTypes.length).toBeGreaterThan(0);
        });
    });

    describe('Provider configuration', () => {
        it('includes AWS provider with region variable', () => {
            const result = generateTerraform(makeInfraMap([makeNode({})]));
            const providerFile = result.files.find(f => f.name === 'provider.tf')!;
            expect(providerFile.content).toContain('provider "aws"');
            expect(providerFile.content).toContain('var.region');
        });

        it('includes terraform required_providers block', () => {
            const result = generateTerraform(makeInfraMap([]));
            const providerFile = result.files.find(f => f.name === 'provider.tf')!;
            expect(providerFile.content).toContain('required_providers');
            expect(providerFile.content).toContain('hashicorp/aws');
        });
    });

    describe('VPC resource generation', () => {
        it('generates aws_vpc resource with correct CIDR', () => {
            const map = makeInfraMap([
                makeNode({ id: 'vpc-1', type: 'vpc', name: 'Main VPC', meta: { vpcId: 'vpc-abc', cidr: '10.0.0.0/16' } }),
            ]);
            const result = generateTerraform(map);
            const mainTf = result.files.find(f => f.name === 'main.tf')!;
            expect(mainTf.content).toContain('resource "aws_vpc"');
            expect(mainTf.content).toContain('10.0.0.0/16');
        });
    });

    describe('EC2 resource generation', () => {
        it('generates aws_instance resource with instance type', () => {
            const map = makeInfraMap([
                makeNode({
                    id: 'ec2-1', type: 'ec2', name: 'Web Server',
                    meta: { instanceType: 't3.micro', subnetId: 'subnet-123', vpcId: 'vpc-abc' }
                }),
            ]);
            const result = generateTerraform(map);
            const mainTf = result.files.find(f => f.name === 'main.tf')!;
            expect(mainTf.content).toContain('resource "aws_instance"');
            expect(mainTf.content).toContain('t3.micro');
        });
    });

    describe('Security Group generation', () => {
        it('generates aws_security_group with restrictive ingress', () => {
            const map = makeInfraMap([
                makeNode({
                    id: 'sg-1', type: 'sg', name: 'web-sg',
                    meta: { sgId: 'sg-123', vpcId: 'vpc-abc' }
                }),
            ]);
            const result = generateTerraform(map);
            const mainTf = result.files.find(f => f.name === 'main.tf')!;
            expect(mainTf.content).toContain('resource "aws_security_group"');
            // After our bug fix, should NOT contain 0.0.0.0/0 in ingress
            expect(mainTf.content).toContain('var.allowed_cidr');
            expect(mainTf.content).toContain('443');
        });
    });

    describe('S3 resource generation', () => {
        it('generates aws_s3_bucket resource', () => {
            const map = makeInfraMap([
                makeNode({ id: 's3-1', type: 's3', name: 'my-app-bucket', meta: { name: 'my-app-bucket' } }),
            ]);
            const result = generateTerraform(map);
            const mainTf = result.files.find(f => f.name === 'main.tf')!;
            expect(mainTf.content).toContain('resource "aws_s3_bucket"');
        });
    });

    describe('Variables file', () => {
        it('includes aws_region variable', () => {
            const result = generateTerraform(makeInfraMap([makeNode({})]));
            const varsTf = result.files.find(f => f.name === 'variables.tf')!;
            expect(varsTf.content).toContain('variable "region"');
        });
    });

    describe('Edge cases', () => {
        it('handles empty infrastructure map', () => {
            const result = generateTerraform(makeInfraMap([]));
            expect(result.files).toHaveLength(4);
            expect(result.resourceCount).toBe(0);
        });

        it('counts resources correctly', () => {
            const map = makeInfraMap([
                makeNode({ id: 'vpc-1', type: 'vpc', meta: { vpcId: 'vpc-1', cidr: '10.0.0.0/16' } }),
                makeNode({ id: 'ec2-1', type: 'ec2', meta: { instanceType: 't3.micro' } }),
            ]);
            const result = generateTerraform(map);
            expect(result.resourceCount).toBe(2);
        });
    });
});
