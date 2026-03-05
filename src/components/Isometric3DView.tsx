import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Billboard, RoundedBox, Line } from '@react-three/drei';
import * as THREE from 'three';

// ── Types (mirrored from AwsArchitecture) ─────────────────────────────────
type ResourceStatus = "active" | "stopped" | "idle" | "orphan" | "pending";

interface InfraNode {
    id: string;
    type: string;
    category: string;
    name: string;
    region: string;
    status: ResourceStatus;
    meta: Record<string, any>;
}

interface InfraEdge {
    source: string;
    target: string;
    label: string;
}

interface InfraMap {
    nodes: InfraNode[];
    edges: InfraEdge[];
    summary: any;
    fetchedAt: number;
}

// ── Layer Config ──────────────────────────────────────────────────────────
const LAYER_CONFIG: Record<string, { layer: number; color: string; emissive: string }> = {
    vpc: { layer: 0, color: '#0ea5e9', emissive: '#0369a1' },
    subnet: { layer: 1, color: '#22d3ee', emissive: '#0e7490' },
    igw: { layer: 1, color: '#38bdf8', emissive: '#0284c7' },
    nat: { layer: 1, color: '#7dd3fc', emissive: '#0369a1' },
    rt: { layer: 1, color: '#67e8f9', emissive: '#06b6d4' },
    elb: { layer: 2, color: '#f97316', emissive: '#c2410c' },
    tg: { layer: 2, color: '#fb923c', emissive: '#ea580c' },
    ec2: { layer: 3, color: '#f59e0b', emissive: '#b45309' },
    lambda: { layer: 3, color: '#a855f7', emissive: '#7e22ce' },
    rds: { layer: 4, color: '#3b82f6', emissive: '#1d4ed8' },
    ebs: { layer: 4, color: '#22c55e', emissive: '#15803d' },
    s3: { layer: 4, color: '#10b981', emissive: '#047857' },
    eip: { layer: 4, color: '#6366f1', emissive: '#4338ca' },
    sg: { layer: 5, color: '#ef4444', emissive: '#b91c1c' },
    iam: { layer: 5, color: '#ec4899', emissive: '#be185d' },
    asg: { layer: 3, color: '#f59e0b', emissive: '#92400e' },
    route53: { layer: 5, color: '#8b5cf6', emissive: '#6d28d9' },
};

const NODE_SPACING = 6;
const LAYER_HEIGHT = 5;

const STATUS_GLOW: Record<ResourceStatus, string> = {
    active: '#22c55e',
    stopped: '#6b7280',
    idle: '#3b82f6',
    orphan: '#ef4444',
    pending: '#f59e0b',
};

// ── Edge Classification ───────────────────────────────────────────────────
function classifyEdge3D(label: string): string {
    if (['hosts', 'attached-to', 'contains-elb', 'has-route-table', 'contains', 'in-subnet'].includes(label)) return '#38bdf8';
    if (label.includes('routes') || label.includes('forward')) return '#f97316';
    if (label.includes('volume') || label.includes('storage') || label.includes('s3')) return '#22c55e';
    if (label.includes('sg') || label.includes('iam') || label.includes('role')) return '#a855f7';
    return '#71717a';
}

// ── 3D Node Component ─────────────────────────────────────────────────────
function InfraNode3D({ node, position }: { node: InfraNode; position: [number, number, number] }) {
    const meshRef = useRef<THREE.Mesh>(null);
    const config = LAYER_CONFIG[node.type] || { layer: 6, color: '#71717a', emissive: '#404040' };
    const statusColor = STATUS_GLOW[node.status];

    // Subtle float animation
    useFrame(({ clock }) => {
        if (meshRef.current) {
            meshRef.current.position.y = position[1] + Math.sin(clock.getElapsedTime() * 0.5 + position[0]) * 0.08;
        }
    });

    const isVPC = node.type === 'vpc';
    const isSubnet = node.type === 'subnet';
    const isDB = node.type === 'rds';
    const isS3 = node.type === 's3';

    return (
        <group position={position}>
            {/* Status indicator ring */}
            <mesh position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[isVPC ? 2.2 : 0.9, isVPC ? 2.5 : 1.05, 32]} />
                <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={0.6} transparent opacity={0.5} />
            </mesh>

            {/* Main mesh */}
            <mesh ref={meshRef} castShadow receiveShadow>
                {isVPC ? (
                    <boxGeometry args={[4, 0.4, 4]} />
                ) : isSubnet ? (
                    <boxGeometry args={[2.5, 0.3, 2.5]} />
                ) : isDB ? (
                    <cylinderGeometry args={[0.7, 0.7, 1.2, 16]} />
                ) : isS3 ? (
                    <cylinderGeometry args={[0.5, 0.8, 1, 6]} />
                ) : (
                    <boxGeometry args={[1.2, 1.2, 1.2]} />
                )}
                <meshStandardMaterial
                    color={config.color}
                    emissive={config.emissive}
                    emissiveIntensity={0.3}
                    metalness={0.4}
                    roughness={0.5}
                />
            </mesh>

            {/* Label */}
            <Billboard position={[0, isVPC ? 1.2 : 1.5, 0]} follow lockX={false} lockY={false} lockZ={false}>
                <Text
                    fontSize={0.4}
                    color="#e4e4e7"
                    outlineWidth={0.04}
                    outlineColor="#09090b"
                    anchorX="center"
                    anchorY="bottom"
                    maxWidth={5}
                >
                    {node.name.length > 16 ? node.name.slice(0, 14) + '…' : node.name}
                </Text>
                <Text
                    fontSize={0.25}
                    color={config.color}
                    position={[0, -0.35, 0]}
                    anchorX="center"
                    anchorY="bottom"
                >
                    {node.type.toUpperCase()}
                </Text>
            </Billboard>
        </group>
    );
}

// ── 3D Edge Component ─────────────────────────────────────────────────────
function InfraEdge3D({ start, end, color }: { start: [number, number, number]; end: [number, number, number]; color: string }) {
    const mid: [number, number, number] = [
        (start[0] + end[0]) / 2,
        Math.max(start[1], end[1]) + 1.5,
        (start[2] + end[2]) / 2,
    ];

    return (
        <Line
            points={[start, mid, end]}
            color={color}
            lineWidth={1.5}
            transparent
            opacity={0.5}
            dashed
            dashSize={0.3}
            gapSize={0.15}
        />
    );
}

// ── Grid Floor ────────────────────────────────────────────────────────────
function GridFloor() {
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial color="#0a0a0a" transparent opacity={0.5} />
        </mesh>
    );
}

// ── Layer Label ───────────────────────────────────────────────────────────
const LAYER_LABELS = ['VPC / Region', 'Networking', 'Load Balancing', 'Compute', 'Data / Storage', 'Security / IAM', 'Other'];

function LayerLabel({ y, label }: { y: number; label: string }) {
    return (
        <Billboard position={[-12, y + 0.5, 0]} follow lockX={false} lockY={false} lockZ={false}>
            <Text fontSize={0.5} color="#52525b" anchorX="right" anchorY="middle">
                {label}
            </Text>
        </Billboard>
    );
}

// ── Main Scene ────────────────────────────────────────────────────────────
function InfraScene({ data }: { data: InfraMap }) {
    const { positions, edges3D, layersUsed } = useMemo(() => {
        const posMap: Record<string, [number, number, number]> = {};
        const layerNodes: Record<number, InfraNode[]> = {};

        // Group by layer
        data.nodes.forEach(node => {
            const config = LAYER_CONFIG[node.type] || { layer: 6 };
            if (!layerNodes[config.layer]) layerNodes[config.layer] = [];
            layerNodes[config.layer].push(node);
        });

        // Compute positions: grid within each layer
        const usedLayers = new Set<number>();
        Object.entries(layerNodes).forEach(([layerStr, nodes]) => {
            const layer = parseInt(layerStr);
            usedLayers.add(layer);
            const cols = Math.ceil(Math.sqrt(nodes.length));
            nodes.forEach((node, i) => {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const x = (col - (cols - 1) / 2) * NODE_SPACING;
                const z = (row - (Math.ceil(nodes.length / cols) - 1) / 2) * NODE_SPACING;
                const y = layer * LAYER_HEIGHT;
                posMap[node.id] = [x, y, z];
            });
        });

        // Build edge data
        const edgeData: { start: [number, number, number]; end: [number, number, number]; color: string }[] = [];
        data.edges.forEach(edge => {
            const s = posMap[edge.source];
            const t = posMap[edge.target];
            if (s && t) {
                edgeData.push({ start: s, end: t, color: classifyEdge3D(edge.label) });
            }
        });

        return { positions: posMap, edges3D: edgeData, layersUsed: usedLayers };
    }, [data]);

    return (
        <>
            {/* Lighting */}
            <ambientLight intensity={0.4} />
            <directionalLight position={[15, 30, 15]} intensity={1} castShadow shadow-mapSize={2048} />
            <pointLight position={[-10, 20, -10]} intensity={0.3} color="#38bdf8" />
            <pointLight position={[10, 10, 10]} intensity={0.2} color="#a855f7" />

            {/* Grid */}
            <GridFloor />
            <gridHelper args={[100, 50, '#1a1a2e', '#1a1a2e']} position={[0, -0.99, 0]} />

            {/* Layer labels */}
            {Array.from(layersUsed).map(layer => (
                <LayerLabel key={layer} y={layer * LAYER_HEIGHT} label={LAYER_LABELS[layer] || `Layer ${layer}`} />
            ))}

            {/* Layer planes (translucent floors per tier) */}
            {Array.from(layersUsed).map(layer => (
                <mesh key={`plane-${layer}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, layer * LAYER_HEIGHT - 0.5, 0]}>
                    <planeGeometry args={[40, 40]} />
                    <meshStandardMaterial color="#18181b" transparent opacity={0.15} side={THREE.DoubleSide} />
                </mesh>
            ))}

            {/* Nodes */}
            {data.nodes.map(node => {
                const pos = positions[node.id];
                if (!pos) return null;
                return <InfraNode3D key={node.id} node={node} position={pos} />;
            })}

            {/* Edges */}
            {edges3D.map((edge, i) => (
                <InfraEdge3D key={i} start={edge.start} end={edge.end} color={edge.color} />
            ))}
        </>
    );
}

// ── Exported Component ────────────────────────────────────────────────────
export function Isometric3DView({ data }: { data: InfraMap }) {
    return (
        <div className="w-full h-full bg-zinc-950 rounded-xl border border-zinc-800/50 overflow-hidden relative">
            {/* Legend */}
            <div className="absolute top-3 left-3 z-10 bg-zinc-950/90 backdrop-blur-sm border border-zinc-800 rounded-lg px-3 py-2 space-y-1">
                <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Layers</div>
                {LAYER_LABELS.slice(0, 6).map((label, i) => (
                    <div key={i} className="flex items-center gap-2 text-[9px] text-zinc-400">
                        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: ['#0ea5e9', '#22d3ee', '#f97316', '#f59e0b', '#22c55e', '#ef4444'][i] }} />
                        {label}
                    </div>
                ))}
            </div>

            {/* 3D Badge */}
            <div className="absolute top-3 right-3 z-10">
                <span className="text-[9px] font-mono uppercase tracking-widest px-2 py-1 rounded-full border text-violet-400 bg-violet-950/50 border-violet-500/30">
                    🎮 3D Isometric
                </span>
            </div>

            {/* Controls hint */}
            <div className="absolute bottom-3 left-3 z-10 text-[9px] text-zinc-600 font-mono">
                🖱 Left: Rotate • Right: Pan • Scroll: Zoom
            </div>

            <Canvas
                camera={{ position: [25, 20, 25], fov: 50 }}
                shadows
                style={{ background: '#09090b', touchAction: 'none' }}
                gl={{ antialias: true, alpha: false }}
            >
                <fog attach="fog" args={['#09090b', 40, 80]} />
                <InfraScene data={data} />
                <OrbitControls
                    makeDefault
                    enableRotate={true}
                    enablePan={true}
                    enableZoom={true}
                    enableDamping={true}
                    dampingFactor={0.05}
                    minDistance={5}
                    maxDistance={60}
                    maxPolarAngle={Math.PI / 2.1}
                />
            </Canvas>
        </div>
    );
}
