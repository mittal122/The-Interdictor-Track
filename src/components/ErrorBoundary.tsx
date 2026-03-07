/**
 * React Error Boundary
 * 
 * Catches JavaScript errors in child component trees and displays
 * a fallback UI instead of crashing the entire application.
 */
import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallbackTitle?: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        // In production, this would send to an error reporting service (Sentry, Datadog)
        console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex h-full min-h-[300px] items-center justify-center">
                    <div className="flex max-w-md flex-col items-center gap-4 rounded-xl border border-red-900/30 bg-red-950/10 p-8 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-900/20 border border-red-800/30">
                            <AlertTriangle className="h-7 w-7 text-red-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-red-300">
                            {this.props.fallbackTitle || 'Something went wrong'}
                        </h3>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            This section encountered an unexpected error. The rest of the dashboard
                            is still operational.
                        </p>
                        {this.state.error && (
                            <code className="mt-2 block max-w-full overflow-x-auto rounded bg-zinc-900 px-3 py-2 text-xs text-zinc-500 border border-zinc-800">
                                {this.state.error.message}
                            </code>
                        )}
                        <button
                            onClick={this.handleRetry}
                            className="mt-2 flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
                        >
                            <RotateCcw className="h-4 w-4" />
                            Try Again
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
