import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// In a real enterprise application, this would be HashiCorp Vault or AWS Secrets Manager.
// For this platform, we simulate an encrypted vault stored securely in memory
// (or backed by a tightly controlled database).
const VAULT_SECRET_KEY = process.env.VAULT_SECRET_KEY || process.env.JWT_SECRET || "fallback-secret-32-chars-long-minimum";
const ALGORITHM = 'aes-256-cbc';

// In-memory simulated vault
const credentialVault = new Map<string, string>(); // accountId -> encrypted string

export interface StoredCredentials {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    roleToAssume?: string; // The restricted IAM role the scanner should assume
}

function encrypt(text: string): string {
    if (VAULT_SECRET_KEY.length < 32) throw new Error("Vault secret key too short.");
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(VAULT_SECRET_KEY.substring(0, 32)), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string): string {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(VAULT_SECRET_KEY.substring(0, 32)), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

/**
 * Stores credentials securely in the vault.
 * Never logs credentials.
 */
export function storeCredentialsInVault(creds: StoredCredentials): void {
    const payload = JSON.stringify(creds);
    const encrypted = encrypt(payload);
    credentialVault.set(creds.accountId, encrypted);
    console.log(`[Vault] Credentials securely stored for account: ${creds.accountId}`);
}

/**
 * Retrieves credentials from the vault for the scanning engine.
 * Throws an error if not found.
 */
export function getCredentialsFromVault(accountId: string): StoredCredentials {
    const encrypted = credentialVault.get(accountId);
    if (!encrypted) {
        throw new Error(`Credentials not found in vault for account: ${accountId}`);
    }

    try {
        const decrypted = decrypt(encrypted);
        return JSON.parse(decrypted) as StoredCredentials;
    } catch (error) {
        console.error(`[Vault] Failed to decrypt credentials for account: ${accountId}`);
        throw new Error("Vault decryption error. Integrity compromised.");
    }
}

/**
 * Safely removes credentials from the vault.
 */
export function removeCredentialsFromVault(accountId: string): boolean {
    return credentialVault.delete(accountId);
}

// Immediately provision vault with demo details if running explicitly.
export function _seedVaultForDemo(accountId: string, region: string) {
    // Only used to tie into existing "Demo Mode" fallback if no keys are provided
    // In production, users must submit their own keys via a secure endpoint.
    storeCredentialsInVault({
        accountId,
        accessKeyId: "DEMO_KEY",
        secretAccessKey: "DEMO_SECRET",
        region
    })
}
