import { InfraMap, InfraNode } from '../services/awsInfrastructureEngine';

/**
 * Filters the infrastructure map to only include resources inside the specified VPC,
 * plus external resources directly connected to those VPC resources,
 * or resources that form the boundary (like Internet Gateways).
 */
export function filterInfrastructureByVpc(infraMap: InfraMap | null, vpcId: string): InfraMap | null {
    if (!infraMap || !vpcId || vpcId === "all") return infraMap;

    // 1. Identify all nodes that belong directly to the VPC.
    // This includes the VPC itself, subnets, route tables, and security groups.
    const directVpcNodes = infraMap.nodes.filter(node =>
        node.id === vpcId ||
        (node.meta && node.meta.vpcId === vpcId)
    );

    const directVpcNodeIds = new Set(directVpcNodes.map(n => n.id));

    // 2. Identify contained resources (e.g. instances inside the matched subnets).
    // Resources connected to the subnets via edges.
    const containedNodeIds = new Set<string>();

    // Pass 1: find resources directly connected to subnets, SGs, DB subnet groups
    for (const edge of infraMap.edges) {
        if (directVpcNodeIds.has(edge.source)) {
            containedNodeIds.add(edge.target);
        } else if (directVpcNodeIds.has(edge.target)) {
            containedNodeIds.add(edge.source);
        }
    }

    // Pass 2: find resources connected to the contained resources (e.g. EBS to EC2)
    for (const edge of infraMap.edges) {
        if (containedNodeIds.has(edge.source)) {
            containedNodeIds.add(edge.target);
        } else if (containedNodeIds.has(edge.target)) {
            containedNodeIds.add(edge.source);
        }
    }

    // Combine all allowed node IDs
    const allowedNodeIds = new Set([...directVpcNodeIds, ...containedNodeIds]);

    // 3. Filter nodes
    const filteredNodes = infraMap.nodes.filter(node => allowedNodeIds.has(node.id));

    // 4. Filter edges (both source and target must be in the filtered nodes)
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = infraMap.edges.filter(
        edge => filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
    );

    // 5. Build new summary
    return {
        ...infraMap,
        nodes: filteredNodes,
        edges: filteredEdges,
        summary: {
            ...infraMap.summary,
            totalResources: filteredNodes.length,
            activeCount: filteredNodes.filter(n => n.status === "active").length,
            stoppedCount: filteredNodes.filter(n => n.status === "stopped").length,
            orphanCount: filteredNodes.filter(n => n.status === "orphan").length,
            idleCount: filteredNodes.filter(n => n.status === "idle").length,
            serviceTypes: [...new Set(filteredNodes.map(n => n.type))]
        }
    };
}
