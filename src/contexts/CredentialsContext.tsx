import React, { createContext, useContext, useState } from 'react';

export interface CloudCredentials {
    awsAccessKeyId: string;
    awsSecretKey: string;
    awsRegion: string;
}

interface CredentialsContextType {
    credentials: CloudCredentials | null;
    setCredentials: (creds: CloudCredentials, rememberMe?: boolean) => void;
    clearCredentials: () => void;
}

const CredentialsContext = createContext<CredentialsContextType>({
    credentials: null,
    setCredentials: () => { },
    clearCredentials: () => { },
});

/**
 * Stores cloud credentials in React state (transient memory only).
 * Credentials are NEVER persisted to localStorage or any browser storage.
 */
export function CredentialsProvider({ children }: { children: React.ReactNode }) {
    const [credentials, setCredentialsState] = useState<CloudCredentials | null>(null);

    const setCredentials = (creds: CloudCredentials) => {
        setCredentialsState(creds);
    };

    const clearCredentials = () => {
        setCredentialsState(null);
    };

    return (
        <CredentialsContext.Provider value={{ credentials, setCredentials, clearCredentials }}>
            {children}
        </CredentialsContext.Provider>
    );
}

export function useCredentials() {
    return useContext(CredentialsContext);
}
