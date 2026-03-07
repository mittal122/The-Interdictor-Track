/**
 * Zod Schemas for Socket.IO Event Payloads
 * 
 * Industry-standard input validation — every incoming payload
 * is validated before reaching business logic or AWS APIs.
 */
import { z } from 'zod';

// ── Launch EC2 Instance ──────────────────────────────────────────────────
export const LaunchEc2Schema = z.object({
    region: z.string()
        .regex(/^[a-z]{2}-[a-z]+-\d$/, 'Invalid AWS region format')
        .default('us-east-1'),
    amiId: z.string()
        .regex(/^ami-[a-f0-9]{8,17}$/, 'Invalid AMI ID format')
        .optional(),
});

// ── Terminate / Stop / Start EC2 Instance ────────────────────────────────
export const Ec2LifecycleSchema = z.object({
    region: z.string().regex(/^[a-z]{2}-[a-z]+-\d$/, 'Invalid AWS region format'),
    instanceId: z.string().regex(/^i-[a-f0-9]{8,17}$/, 'Invalid instance ID format'),
});

// ── Execute Command ──────────────────────────────────────────────────────
export const ExecuteCommandSchema = z.object({
    command: z.string()
        .min(1, 'Command cannot be empty')
        .max(500, 'Command too long')
        .trim(),
});

// ── Delete Wasted Resource ───────────────────────────────────────────────
export const DeleteWasteSchema = z.object({
    resourceId: z.string().min(1, 'Resource ID required'),
    resourceType: z.enum(['ebs', 'sg', 'eip']),
    region: z.string().regex(/^[a-z]{2}-[a-z]+-\d$/, 'Invalid AWS region format'),
});

// ── Validate Credentials ─────────────────────────────────────────────────
export const ValidateCredsSchema = z.object({
    accessKeyId: z.string().min(16, 'Access key too short').max(128),
    secretAccessKey: z.string().min(16, 'Secret key too short').max(128),
    region: z.string().regex(/^[a-z]{2}-[a-z]+-\d$/).default('us-east-1'),
});

// ── Auth Login ───────────────────────────────────────────────────────────
export const LoginSchema = z.object({
    username: z.string().min(1, 'Username required').max(255).trim(),
    password: z.string().min(1, 'Password required').max(255),
});

/**
 * Validate a payload against a schema and return a typed result.
 * On failure, returns a user-friendly error message.
 */
export function validatePayload<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    const errorMessages = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    return { success: false, error: `Validation failed: ${errorMessages}` };
}
