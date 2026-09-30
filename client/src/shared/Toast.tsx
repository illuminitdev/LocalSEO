import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, X } from 'lucide-react';

const DISMISS_MS = 6000;

type ToastContextValue = {
    show: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [message, setMessage] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clear = useCallback(() => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        setMessage(null);
    }, []);

    const show = useCallback(
        (next: string) => {
            if (timer.current) clearTimeout(timer.current);
            setMessage(next);
            timer.current = setTimeout(() => {
                timer.current = null;
                setMessage(null);
            }, DISMISS_MS);
        },
        []
    );

    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
    }, []);

    return (
        <ToastContext.Provider value={{ show }}>
            {children}
            {message && (
                <div className="fixed top-4 right-4 z-[80] max-w-sm animate-in fade-in slide-in-from-right duration-200">
                    <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-lg">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <p className="min-w-0 flex-1 font-medium">{message}</p>
                        <button
                            type="button"
                            onClick={clear}
                            className="rounded p-0.5 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-900"
                            aria-label="Dismiss"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            )}
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
}
