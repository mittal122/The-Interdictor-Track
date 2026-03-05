/**
 * Terraform Infrastructure Export Service
 *
 * Generates Terraform HCL code from discovered AWS resources.
 * Produces main.tf, variables.tf, outputs.tf, provider.tf
 */

interface InfraNode {
    id: string;
    type: string;
    category: string;
    name: string;
    region: string;
    status: string;
    meta: Record<string, any>;
}

interface InfraMap {
    nodes: InfraNode[];
    edges: { source: string; target: string; label: string }[];
    summary: any;
    fetchedAt: number;
}

interface TerraformOutput {
    files: { name: string; content: string }[];
    resourceCount: number;
    supportedTypes: string[];
}

// ── Name Sanitization ─────────────────────────────────────────────────────
function sanitizeName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/^[0-9]/, 'r_$&')
        .replace(/_+/g, '_')
        .replace(/_$/, '');
}

function tfName(node: InfraNode): string {
    return sanitizeName(node.name || node.id);
}

// ── Resource Generators ───────────────────────────────────────────────────
type Generator = (node: InfraNode, nodes: InfraNode[]) => string;

const generators: Record<string, Generator> = {
    vpc: (node) => {
        const cidr = node.meta?.cidrBlock || '10.0.0.0/16';
        const name = tfName(node);
        return `
resource "aws_vpc" "${name}" {
  cidr_block           = "${cidr}"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${node.name}"
  }
}
`;
    },

    subnet: (node, nodes) => {
        const cidr = node.meta?.cidrBlock || '10.0.1.0/24';
        const az = node.meta?.availabilityZone || `\${var.region}a`;
        const name = tfName(node);
        const vpcRef = findVpcRef(node, nodes);
        return `
resource "aws_subnet" "${name}" {
  vpc_id            = ${vpcRef}
  cidr_block        = "${cidr}"
  availability_zone = "${az}"

  tags = {
    Name = "${node.name}"
  }
}
`;
    },

    ec2: (node, nodes) => {
        const instanceType = node.meta?.instanceType || 't3.medium';
        const ami = node.meta?.imageId || 'ami-0c02fb55956c7d316';
        const name = tfName(node);
        const subnetRef = findSubnetRef(node, nodes);
        const sgRefs = findSGRefs(node, nodes);
        return `
resource "aws_instance" "${name}" {
  ami           = "${ami}"
  instance_type = "${instanceType}"
  subnet_id     = ${subnetRef}
${sgRefs ? `  vpc_security_group_ids = [${sgRefs}]` : ''}

  tags = {
    Name = "${node.name}"
  }
}
`;
    },

    sg: (node, nodes) => {
        const name = tfName(node);
        const vpcRef = findVpcRef(node, nodes);
        return `
resource "aws_security_group" "${name}" {
  name        = "${node.name}"
  description = "Security group for ${node.name}"
  vpc_id      = ${vpcRef}

  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all inbound (customize in production)"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = {
    Name = "${node.name}"
  }
}
`;
    },

    elb: (node, nodes) => {
        const name = tfName(node);
        const subnetRefs = findAllSubnetRefs(nodes);
        return `
resource "aws_lb" "${name}" {
  name               = "${sanitizeName(node.name)}"
  internal           = false
  load_balancer_type = "application"
  subnets            = [${subnetRefs}]

  tags = {
    Name = "${node.name}"
  }
}
`;
    },

    rds: (node, nodes) => {
        const name = tfName(node);
        const engine = node.meta?.engine || 'mysql';
        const instanceClass = node.meta?.instanceClass || 'db.t3.medium';
        const storage = node.meta?.allocatedStorage || 20;
        const sgRefs = findSGRefs(node, nodes);
        return `
resource "aws_db_instance" "${name}" {
  identifier        = "${sanitizeName(node.name)}"
  engine            = "${engine}"
  engine_version    = "${node.meta?.engineVersion || '8.0'}"
  instance_class    = "${instanceClass}"
  allocated_storage = ${storage}
  db_name           = "${sanitizeName(node.name).replace(/_/g, '')}"
  username          = "admin"
  password          = var.db_password
  skip_final_snapshot = true
${sgRefs ? `  vpc_security_group_ids = [${sgRefs}]` : ''}

  tags = {
    Name = "${node.name}"
  }
}
`;
    },

    s3: (node) => {
        const name = tfName(node);
        return `
resource "aws_s3_bucket" "${name}" {
  bucket = "${sanitizeName(node.name)}"

  tags = {
    Name = "${node.name}"
  }
}

resource "aws_s3_bucket_versioning" "${name}_versioning" {
  bucket = aws_s3_bucket.${name}.id
  versioning_configuration {
    status = "Enabled"
  }
}
`;
    },

    ebs: (node) => {
        const name = tfName(node);
        const size = node.meta?.size || 30;
        const volType = node.meta?.volumeType || 'gp3';
        return `
resource "aws_ebs_volume" "${name}" {
  availability_zone = "\${var.region}a"
  size              = ${size}
  type              = "${volType}"

  tags = {
    Name = "${node.name}"
  }
}
`;
    },

    igw: (node, nodes) => {
        const name = tfName(node);
        const vpcRef = findVpcRef(node, nodes);
        return `
resource "aws_internet_gateway" "${name}" {
  vpc_id = ${vpcRef}

  tags = {
    Name = "${node.name}"
  }
}
`;
    },

    nat: (node, nodes) => {
        const name = tfName(node);
        const subnetRef = findSubnetRef(node, nodes);
        return `
resource "aws_eip" "${name}_eip" {
  domain = "vpc"
}

resource "aws_nat_gateway" "${name}" {
  allocation_id = aws_eip.${name}_eip.id
  subnet_id     = ${subnetRef}

  tags = {
    Name = "${node.name}"
  }
}
`;
    },

    lambda: (node) => {
        const name = tfName(node);
        const runtime = node.meta?.runtime || 'nodejs18.x';
        const memory = node.meta?.memorySize || 128;
        return `
resource "aws_lambda_function" "${name}" {
  function_name = "${node.name}"
  runtime       = "${runtime}"
  handler       = "index.handler"
  memory_size   = ${memory}
  timeout       = 30
  role          = aws_iam_role.lambda_exec.arn

  filename         = "lambda_placeholder.zip"
  source_code_hash = filebase64sha256("lambda_placeholder.zip")

  tags = {
    Name = "${node.name}"
  }
}
`;
    },
};

// ── Helper: Find References ───────────────────────────────────────────────
function findVpcRef(node: InfraNode, nodes: InfraNode[]): string {
    const vpcId = node.meta?.vpcId;
    if (vpcId) {
        const vpc = nodes.find(n => n.type === 'vpc' && (n.meta?.vpcId === vpcId || n.id.includes(vpcId)));
        if (vpc) return `aws_vpc.${tfName(vpc)}.id`;
    }
    const anyVpc = nodes.find(n => n.type === 'vpc');
    return anyVpc ? `aws_vpc.${tfName(anyVpc)}.id` : '"vpc-placeholder"';
}

function findSubnetRef(node: InfraNode, nodes: InfraNode[]): string {
    const subnetId = node.meta?.subnetId;
    if (subnetId) {
        const subnet = nodes.find(n => n.type === 'subnet' && (n.meta?.subnetId === subnetId || n.id.includes(subnetId)));
        if (subnet) return `aws_subnet.${tfName(subnet)}.id`;
    }
    const anySub = nodes.find(n => n.type === 'subnet');
    return anySub ? `aws_subnet.${tfName(anySub)}.id` : '"subnet-placeholder"';
}

function findAllSubnetRefs(nodes: InfraNode[]): string {
    const subnets = nodes.filter(n => n.type === 'subnet');
    if (subnets.length === 0) return '"subnet-placeholder"';
    return subnets.map(s => `aws_subnet.${tfName(s)}.id`).join(', ');
}

function findSGRefs(node: InfraNode, nodes: InfraNode[]): string {
    const sgs = nodes.filter(n => n.type === 'sg' && n.region === node.region);
    if (sgs.length === 0) return '';
    return sgs.slice(0, 2).map(s => `aws_security_group.${tfName(s)}.id`).join(', ');
}

// ── File Generators ───────────────────────────────────────────────────────
function generateProviderTf(region: string): string {
    return `terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}
`;
}

function generateVariablesTf(nodes: InfraNode[]): string {
    const regions = [...new Set(nodes.map(n => n.region).filter(r => r && r !== 'global'))];
    const defaultRegion = regions[0] || 'us-east-1';

    let content = `variable "region" {
  description = "AWS region"
  type        = string
  default     = "${defaultRegion}"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}
`;

    // Add db_password if RDS exists
    if (nodes.some(n => n.type === 'rds')) {
        content += `
variable "db_password" {
  description = "Database master password"
  type        = string
  sensitive   = true
}
`;
    }

    return content;
}

function generateOutputsTf(nodes: InfraNode[]): string {
    let content = '# ── Outputs ─────────────────────────────────────────────────────────────────\n';

    const vpcs = nodes.filter(n => n.type === 'vpc');
    vpcs.forEach(vpc => {
        const name = tfName(vpc);
        content += `
output "${name}_id" {
  description = "VPC ID for ${vpc.name}"
  value       = aws_vpc.${name}.id
}
`;
    });

    const ec2s = nodes.filter(n => n.type === 'ec2');
    ec2s.forEach(instance => {
        const name = tfName(instance);
        content += `
output "${name}_public_ip" {
  description = "Public IP of ${instance.name}"
  value       = aws_instance.${name}.public_ip
}
`;
    });

    const rdsInstances = nodes.filter(n => n.type === 'rds');
    rdsInstances.forEach(db => {
        const name = tfName(db);
        content += `
output "${name}_endpoint" {
  description = "RDS endpoint for ${db.name}"
  value       = aws_db_instance.${name}.endpoint
}
`;
    });

    return content;
}

function generateMainTf(nodes: InfraNode[]): string {
    const supportedTypes = Object.keys(generators);
    let content = `# ═══════════════════════════════════════════════════════════════════════════
# AWS Infrastructure — Generated by The Interdictor Track
# Generated at: ${new Date().toISOString()}
# ═══════════════════════════════════════════════════════════════════════════

`;

    // Lambda IAM role if lambda exists
    if (nodes.some(n => n.type === 'lambda')) {
        content += `
# ── Lambda Execution Role ──────────────────────────────────────────────────
resource "aws_iam_role" "lambda_exec" {
  name = "lambda_execution_role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
`;
    }

    // Generate resources in dependency order
    const order = ['vpc', 'igw', 'subnet', 'nat', 'rt', 'sg', 'elb', 'tg', 'ec2', 'lambda', 'rds', 'ebs', 's3', 'eip'];
    const sorted = [...nodes].sort((a, b) => {
        const ai = order.indexOf(a.type);
        const bi = order.indexOf(b.type);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    let currentCategory = '';
    sorted.forEach(node => {
        const gen = generators[node.type];
        if (!gen) return;

        // Category header
        if (node.category !== currentCategory) {
            currentCategory = node.category;
            const label = currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1);
            content += `\n# ── ${label} ${'─'.repeat(60)}\n`;
        }

        content += gen(node, nodes);
    });

    return content;
}

// ── Main Export Function ──────────────────────────────────────────────────
export function generateTerraform(infraMap: InfraMap): TerraformOutput {
    const supportedTypes = Object.keys(generators);
    const supportedNodes = infraMap.nodes.filter(n => supportedTypes.includes(n.type));
    const regions = [...new Set(infraMap.nodes.map(n => n.region).filter(Boolean))];
    const primaryRegion = regions.find(r => r !== 'global') || 'us-east-1';

    return {
        files: [
            { name: 'provider.tf', content: generateProviderTf(primaryRegion) },
            { name: 'variables.tf', content: generateVariablesTf(infraMap.nodes) },
            { name: 'main.tf', content: generateMainTf(supportedNodes) },
            { name: 'outputs.tf', content: generateOutputsTf(supportedNodes) },
        ],
        resourceCount: supportedNodes.length,
        supportedTypes: [...new Set(supportedNodes.map(n => n.type))],
    };
}
