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
 * Stores cloud credentials in React state and optionally persists them
 * to localStorage if the user chooses 'Remember Me'.
 */
export function CredentialsProvider({ children }: { children: React.ReactNode }) {
    const [credentials, setCredentialsState] = useState<CloudCredentials | null>(() => {
        const stored = localStorage.getItem('cloudCredentials');
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {
                return null;
            }
        }
        return null;
    });

    const setCredentials = (creds: CloudCredentials, rememberMe?: boolean) => {
        setCredentialsState(creds);
        if (rememberMe) {
            localStorage.setItem('cloudCredentials', JSON.stringify(creds));
        } else {
            localStorage.removeItem('cloudCredentials');
        }
    };

    const clearCredentials = () => {
        setCredentialsState(null);
        localStorage.removeItem('cloudCredentials');
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
