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
 * Stores cloud credentials in React state (transient memory).
 * Optionally persists them to localStorage if the user explicitly opts-in via "Remember me".
 */
export function CredentialsProvider({ children }: { children: React.ReactNode }) {
    const [credentials, setCredentialsState] = useState<CloudCredentials | null>(() => {
        try {
            const saved = localStorage.getItem('aws_credentials');
            if (saved) return JSON.parse(saved);
        } catch { }
        return null;
    });

    const setCredentials = (creds: CloudCredentials, rememberMe: boolean = false) => {
        setCredentialsState(creds);
        if (rememberMe) {
            localStorage.setItem('aws_credentials', JSON.stringify(creds));
        } else {
            localStorage.removeItem('aws_credentials');
        }
    };

    const clearCredentials = () => {
        setCredentialsState(null);
        localStorage.removeItem('aws_credentials');
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
