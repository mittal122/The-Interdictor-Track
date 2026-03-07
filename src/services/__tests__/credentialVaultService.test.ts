/**
 * Tests for Credential Vault Service
 * 
 * Validates encrypt/decrypt round-trip, store/retrieve, and error handling.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    storeCredentialsInVault,
    getCredentialsFromVault,
    removeCredentialsFromVault,
    _seedVaultForDemo,
    type StoredCredentials,
} from '../credentialVaultService';

describe('Credential Vault Service', () => {
    const testCreds: StoredCredentials = {
        accountId: 'test-account-123',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        region: 'us-east-1',
    };

    describe('Store and Retrieve (encrypt/decrypt round-trip)', () => {
        it('stores and retrieves credentials with all fields intact', () => {
            storeCredentialsInVault(testCreds);
            const retrieved = getCredentialsFromVault(testCreds.accountId);

            expect(retrieved.accountId).toBe(testCreds.accountId);
            expect(retrieved.accessKeyId).toBe(testCreds.accessKeyId);
            expect(retrieved.secretAccessKey).toBe(testCreds.secretAccessKey);
            expect(retrieved.region).toBe(testCreds.region);
        });

        it('handles credentials with roleToAssume field', () => {
            const credsWithRole: StoredCredentials = {
                ...testCreds,
                accountId: 'role-test-account',
                roleToAssume: 'arn:aws:iam::123456789012:role/ScannerRole',
            };
            storeCredentialsInVault(credsWithRole);
            const retrieved = getCredentialsFromVault('role-test-account');
            expect(retrieved.roleToAssume).toBe('arn:aws:iam::123456789012:role/ScannerRole');
        });

        it('overwrites existing credentials for the same account', () => {
            storeCredentialsInVault(testCreds);
            const updatedCreds = { ...testCreds, region: 'eu-west-1' };
            storeCredentialsInVault(updatedCreds);
            const retrieved = getCredentialsFromVault(testCreds.accountId);
            expect(retrieved.region).toBe('eu-west-1');
        });
    });

    describe('Error handling', () => {
        it('throws when retrieving non-existent account', () => {
            expect(() => getCredentialsFromVault('nonexistent-account')).toThrow(
                'Credentials not found in vault'
            );
        });
    });

    describe('Remove', () => {
        it('removes credentials successfully', () => {
            const removalCreds = { ...testCreds, accountId: 'removal-test' };
            storeCredentialsInVault(removalCreds);
            const removed = removeCredentialsFromVault('removal-test');
            expect(removed).toBe(true);
            expect(() => getCredentialsFromVault('removal-test')).toThrow();
        });

        it('returns false when removing non-existent account', () => {
            const removed = removeCredentialsFromVault('does-not-exist');
            expect(removed).toBe(false);
        });
    });

    describe('Demo seeding', () => {
        it('seeds demo credentials and retrieves them', () => {
            _seedVaultForDemo('demo-account', 'us-west-2');
            const retrieved = getCredentialsFromVault('demo-account');
            expect(retrieved.accessKeyId).toBe('DEMO_KEY');
            expect(retrieved.secretAccessKey).toBe('DEMO_SECRET');
            expect(retrieved.region).toBe('us-west-2');
        });
    });
});
