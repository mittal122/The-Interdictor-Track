import { InfraMap, InfraNode } from './awsInfrastructureEngine';

export interface InfrastructureSummary {
    counts: {
        regions: number;
        vpcs: number;
        publicSubnets: number;
        privateSubnets: number;
        ec2Instances: number;
        stoppedInstances: number;
        loadBalancers: number;
        databases: number;
        openSecurityGroups: number;
        unusedVolumes: number;
        [key: string]: number;
    };
    relationships: string[];
}

export function generateInfrastructureSummary(data: InfraMap): InfrastructureSummary {
    const summary: InfrastructureSummary = {
        counts: {
            regions: new Set(data.nodes.map(n => n.region)).size,
            vpcs: data.nodes.filter(n => n.type === 'vpc').length,
            publicSubnets: data.nodes.filter(n => n.type === 'subnet' && n.meta?.type === 'public').length,
            privateSubnets: data.nodes.filter(n => n.type === 'subnet' && n.meta?.type === 'private').length,
            ec2Instances: data.nodes.filter(n => n.type === 'ec2').length,
            stoppedInstances: data.nodes.filter(n => n.type === 'ec2' && n.status === 'stopped').length,
            loadBalancers: data.nodes.filter(n => n.type === 'elb').length,
            databases: data.nodes.filter(n => n.type === 'rds').length,
            // Approximations based on available mock data markers or logical defaults
            openSecurityGroups: data.nodes.filter(n => n.type === 'sg' && String(n.meta?.rules || '').includes('0.0.0.0/0')).length,
            unusedVolumes: data.nodes.filter(n => n.type === 'ebs' && n.status === 'orphan').length,
        },
        relationships: []
    };

    // Extract key relationships
    const relationMap = new Map<string, string[]>(); // e.g. "EC2 -> RDS": ["vpc-123", ...]

    // Find interesting edges
    for (const edge of data.edges) {
        const sourceNode = data.nodes.find(n => n.id === edge.source);
        const targetNode = data.nodes.find(n => n.id === edge.target);
        if (sourceNode && targetNode) {
            const relKey = `${sourceNode.type.toUpperCase()} -> ${targetNode.type.toUpperCase()}`;
            // We specifically want to highlight core operational relationships rather than generic containment
            if (['EC2', 'RDS', 'ELB', 'S3', 'LAMBDA'].includes(sourceNode.type.toUpperCase()) ||
                ['EC2', 'RDS', 'ELB', 'S3', 'LAMBDA'].includes(targetNode.type.toUpperCase())) {
                const existing = relationMap.get(relKey) || 0;
                relationMap.set(relKey, (existing as number) + 1 as any);
            }
        }
    }

    // Format relationship strings
    relationMap.forEach((count, key) => {
        summary.relationships.push(`${key} (${count} connections)`);
    });

    return summary;
}
