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
    const [mode, setModeState] = useState<AppMode>(() => {
        const saved = localStorage.getItem('interdictor-mode');
        return (saved === 'live' || saved === 'demo') ? saved : 'demo';
    });

    const setMode = (newMode: AppMode) => {
        localStorage.setItem('interdictor-mode', newMode);
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
