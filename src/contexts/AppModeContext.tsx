import React, { createContext, useContext, useState, useEffect } from 'react';

export type AppMode = 'demo' | 'live';

interface AppModeContextType {
    mode: AppMode;
    setMode: (mode: AppMode) => void;
}

const AppModeContext = createContext<AppModeContextType>({
    mode: 'demo',
    setMode: () => { },
});

export function AppModeProvider({ children }: { children: React.ReactNode }) {
    // Mode is TRANSIENT — always starts as 'demo' on fresh load.
    // This prevents a stale 'live' mode from bypassing the credential wizard on refresh.
    const [mode, setModeState] = useState<AppMode>('demo');

    const setMode = (newMode: AppMode) => {
        setModeState(newMode);
    };

    return (
        <AppModeContext.Provider value={{ mode, setMode }}>
            {children}
        </AppModeContext.Provider>
    );
}

export function useAppMode() {
    return useContext(AppModeContext);
}
