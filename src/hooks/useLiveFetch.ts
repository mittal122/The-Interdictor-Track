import { useAuth } from '../contexts/AuthContext';
import { useAppMode } from '../contexts/AppModeContext';
import { useCredentials } from '../contexts/CredentialsContext';

/**
 * A fetch() wrapper that automatically injects credential headers
 * when the app is in Live Mode. Falls back to a normal fetch in Demo Mode.
 *
 * Usage:
 *   const liveFetch = useLiveFetch();
 *   const res = await liveFetch('/api/cloud/data', { method: 'POST', body: ... });
 */
export function useLiveFetch() {
    const { token } = useAuth();
    const { mode } = useAppMode();
    const { credentials } = useCredentials();

    return async (url: string, options: RequestInit = {}): Promise<Response> => {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        };

        // Always attach JWT for authenticated routes
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Inject cloud credential headers only in Live Mode
        if (mode === 'live' && credentials) {
            headers['x-cloud-access-key'] = credentials.awsAccessKeyId;
            headers['x-cloud-secret-key'] = credentials.awsSecretKey;
            headers['x-cloud-region'] = credentials.awsRegion;
        }

        return fetch(url, { ...options, headers });
    };
}
