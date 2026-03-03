import React, { createContext, useContext, useState, useEffect } from 'react';

export type AppMode = 'demo' | 'live';

interface AppModeContextType {
    mode: AppMode;
    setMode: (mode: AppMode) => void;
    selectedRegion: string;
    setSelectedRegion: (region: string) => void;
}

const AppModeContext = createContext<AppModeContextType>({
    mode: 'demo',
    setMode: () => { },
    selectedRegion: 'global',
    setSelectedRegion: () => { },
});

export function AppModeProvider({ children }: { children: React.ReactNode }) {
    // Mode is TRANSIENT — always starts as 'demo' on fresh load.
    // This prevents a stale 'live' mode from bypassing the credential wizard on refresh.
    const [mode, setModeState] = useState<AppMode>('demo');
    const [selectedRegion, setSelectedRegion] = useState<string>('global');

    const setMode = (newMode: AppMode) => {
        setModeState(newMode);
        if (newMode === 'demo') {
            setSelectedRegion('global'); // Reset filter when disabling live mode
        }
    };

    return (
        <AppModeContext.Provider value={{ mode, setMode, selectedRegion, setSelectedRegion }}>
            {children}
        </AppModeContext.Provider>
    );
}

export function useAppMode() {
    return useContext(AppModeContext);
}
