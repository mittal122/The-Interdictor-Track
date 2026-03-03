import React, { useState } from 'react';
import {
    Shield, Eye, EyeOff, CheckCircle2, XCircle, Loader2,
    ChevronRight, ChevronLeft, Cloud, Lock, AlertTriangle, X
} from 'lucide-react';
import { cn } from '../utils/cn';
import { useAppMode } from '../contexts/AppModeContext';
import { useCredentials, CloudCredentials } from '../contexts/CredentialsContext';
import { useAuth } from '../contexts/AuthContext';

type Step = 'provider' | 'credentials' | 'validating';

const AWS_REGIONS = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-central-1',
    'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
];

export function LiveModeWizard() {
    const { mode, setMode } = useAppMode();
    const { credentials, setCredentials } = useCredentials();
    const { token, logout } = useAuth();

    const [step, setStep] = useState<Step>('provider');
    const [showSecret, setShowSecret] = useState(false);
    const [form, setForm] = useState({
        awsAccessKeyId: '',
        awsSecretKey: '',
        awsRegion: 'us-east-1',
        rememberMe: false,
    });
    const [validationError, setValidationError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Only show if Live mode is active but no credentials are present
    const isVisible = mode === 'live' && credentials === null;
    if (!isVisible) return null;

    const handleCancel = () => {
        setMode('demo');
        setStep('provider');
        setForm({ awsAccessKeyId: '', awsSecretKey: '', awsRegion: 'us-east-1', rememberMe: false });
        setValidationError(null);
    };

    const handleValidate = async () => {
        if (!form.awsAccessKeyId.trim() || !form.awsSecretKey.trim()) {
            setValidationError('Both Access Key ID and Secret Access Key are required.');
            return;
        }
        if (form.awsAccessKeyId.length < 16) {
            setValidationError('Access Key ID appears to be invalid (too short).');
            return;
        }

        setValidationError(null);
        setStep('validating');
        setLoading(true);

        try {
            const res = await fetch('/api/cloud/validate', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-cloud-access-key': form.awsAccessKeyId,
                    'x-cloud-secret-key': form.awsSecretKey,
                    'x-cloud-region': form.awsRegion,
                },
            });

            if (!res.ok) {
                if (res.status === 401) {
                    logout();
                    return;
                }
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message || 'Credential validation failed. Check your keys and try again.');
            }

            // Success: persist based on rememberMe flag
            setCredentials({
                awsAccessKeyId: form.awsAccessKeyId,
                awsSecretKey: form.awsSecretKey,
                awsRegion: form.awsRegion
            }, form.rememberMe);
            // Reset wizard state for next time
            setStep('provider');
        } catch (err: any) {
            setValidationError(err.message);
            setStep('credentials');
        } finally {
            setLoading(false);
        }
    };

    return (
        // Full-screen dark overlay
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="relative w-full max-w-lg mx-4">
                {/* Card */}
                <div className="rounded-2xl border border-zinc-700/60 bg-zinc-950 shadow-2xl shadow-black/60 overflow-hidden">

                    {/* Header strip */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60 bg-zinc-900/60">
                        <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-700/40">
                                <Shield className="h-4 w-4 text-emerald-400" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-100">Activate Live Mode</h2>
                                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">Secure Credential Injection</p>
                            </div>
                        </div>
                        <button
                            onClick={handleCancel}
                            className="rounded-md p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Step indicator */}
                    <div className="flex items-center gap-0 px-6 py-3 bg-zinc-900/30 border-b border-zinc-800/40">
                        {(['provider', 'credentials', 'validating'] as Step[]).map((s, i) => {
                            const labels = ['Provider', 'Credentials', 'Validate'];
                            const current = step === s;
                            const done = (step === 'credentials' && s === 'provider') ||
                                (step === 'validating' && (s === 'provider' || s === 'credentials'));
                            return (
                                <React.Fragment key={s}>
                                    <div className="flex items-center gap-1.5">
                                        <div className={cn(
                                            'flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold transition-all',
                                            done ? 'bg-emerald-600 text-white' :
                                                current ? 'bg-zinc-100 text-zinc-900' :
                                                    'bg-zinc-800 text-zinc-500'
                                        )}>
                                            {done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
                                        </div>
                                        <span className={cn(
                                            'text-[10px] uppercase tracking-widest font-medium',
                                            current ? 'text-zinc-200' : done ? 'text-emerald-400' : 'text-zinc-600'
                                        )}>{labels[i]}</span>
                                    </div>
                                    {i < 2 && <div className="flex-1 h-px bg-zinc-800 mx-3" />}
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {/* Body */}
                    <div className="px-6 py-6">

                        {/* Step 1: Provider Selection */}
                        {step === 'provider' && (
                            <div className="space-y-4">
                                <p className="text-xs text-zinc-400 leading-relaxed">
                                    Select your cloud provider to begin securely authenticating your session.
                                </p>
                                <div className="grid grid-cols-3 gap-3 mt-4">
                                    {/* AWS - Active */}
                                    <button
                                        onClick={() => setStep('credentials')}
                                        className="flex flex-col items-center gap-2 rounded-xl border border-emerald-700/50 bg-emerald-950/30 p-4 hover:bg-emerald-950/50 transition-all cursor-pointer group"
                                    >
                                        <Cloud className="h-6 w-6 text-emerald-400 group-hover:scale-110 transition-transform" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">AWS</span>
                                        <span className="text-[9px] text-emerald-600 uppercase tracking-wider">Available</span>
                                    </button>
                                    {/* GCP - Coming Soon */}
                                    {['GCP', 'Azure'].map(p => (
                                        <div key={p} className="flex flex-col items-center gap-2 rounded-xl border border-zinc-800/40 bg-zinc-900/20 p-4 opacity-40 cursor-not-allowed">
                                            <Cloud className="h-6 w-6 text-zinc-600" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{p}</span>
                                            <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Soon</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Step 2: Credential Entry */}
                        {step === 'credentials' && (
                            <div className="space-y-4">
                                <p className="text-xs text-zinc-400">Enter your <span className="text-zinc-200 font-medium">AWS IAM credentials</span>. Minimum required permission: <code className="text-xs text-zinc-300 font-mono bg-zinc-800 px-1 rounded">ReadOnlyAccess</code></p>

                                {/* Access Key ID */}
                                <div>
                                    <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1.5">AWS Access Key ID</label>
                                    <input
                                        type="text"
                                        placeholder="AKIA..."
                                        value={form.awsAccessKeyId}
                                        onChange={e => setForm(f => ({ ...f, awsAccessKeyId: e.target.value }))}
                                        className="w-full rounded-lg border border-zinc-700/60 bg-zinc-900 px-3 py-2.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600/60 transition-colors"
                                        spellCheck={false}
                                        autoComplete="off"
                                    />
                                </div>

                                {/* Secret Key */}
                                <div>
                                    <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1.5">AWS Secret Access Key</label>
                                    <div className="relative">
                                        <input
                                            type={showSecret ? 'text' : 'password'}
                                            placeholder="••••••••••••••••••••••••••••••••••••••••"
                                            value={form.awsSecretKey}
                                            onChange={e => setForm(f => ({ ...f, awsSecretKey: e.target.value }))}
                                            className="w-full rounded-lg border border-zinc-700/60 bg-zinc-900 px-3 py-2.5 pr-10 text-xs font-mono text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-emerald-600/60 transition-colors"
                                            spellCheck={false}
                                            autoComplete="new-password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowSecret(s => !s)}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                                        >
                                            {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Remember Me */}
                                <label className="flex items-center gap-2 cursor-pointer group mt-2 w-fit">
                                    <div className="relative flex items-center justify-center">
                                        <input
                                            type="checkbox"
                                            checked={form.rememberMe}
                                            onChange={e => setForm(f => ({ ...f, rememberMe: e.target.checked }))}
                                            className="peer sr-only"
                                        />
                                        <div className="h-4 w-4 rounded border border-zinc-700 bg-zinc-900 transition-all peer-checked:bg-emerald-600 peer-checked:border-emerald-500 group-hover:border-zinc-500"></div>
                                        <CheckCircle2 className="absolute h-3 w-3 text-white opacity-0 transition-opacity peer-checked:opacity-100" />
                                    </div>
                                    <span className="text-[11px] text-zinc-400 group-hover:text-zinc-300 select-none">Remember these credentials (saves securely to browser)</span>
                                </label>

                                {/* Error */}
                                {validationError && (
                                    <div className="flex items-start gap-2 rounded-lg border border-red-900/50 bg-red-950/30 p-3">
                                        <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                                        <p className="text-xs text-red-400">{validationError}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 3: Validating */}
                        {step === 'validating' && (
                            <div className="flex flex-col items-center justify-center py-8 gap-4">
                                <div className="relative">
                                    <div className="h-16 w-16 rounded-full border-2 border-emerald-800/30 flex items-center justify-center">
                                        <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
                                    </div>
                                    <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-semibold text-zinc-100">Validating credentials…</p>
                                    <p className="text-xs text-zinc-500 mt-1">Connecting to AWS <code className="font-mono">{form.awsRegion}</code></p>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                                    <Lock className="h-3 w-3" /> Encrypted transit · Keys masked in server logs
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer actions */}
                    {step !== 'validating' && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800/60 bg-zinc-900/30">
                            <button
                                onClick={step === 'provider' ? handleCancel : () => { setStep('provider'); setValidationError(null); }}
                                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                            >
                                {step === 'provider' ? (
                                    <><X className="h-3.5 w-3.5" /> Cancel &amp; stay in Demo</>
                                ) : (
                                    <><ChevronLeft className="h-3.5 w-3.5" /> Back</>
                                )}
                            </button>

                            {step === 'credentials' && (
                                <button
                                    onClick={handleValidate}
                                    disabled={!form.awsAccessKeyId || !form.awsSecretKey}
                                    className={cn(
                                        "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all",
                                        form.awsAccessKeyId && form.awsSecretKey
                                            ? "bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-500/20 cursor-pointer"
                                            : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                                    )}
                                >
                                    <Shield className="h-3.5 w-3.5" />
                                    Validate &amp; Activate
                                    <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Attribution */}
                <p className="text-center text-[10px] text-zinc-700 mt-3">
                    INTERDICTOR COMMAND CENTER · SECURE SESSION · TLS 1.3
                </p>
            </div>
        </div>
    );
}
