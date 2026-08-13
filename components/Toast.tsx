import React from 'react';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastItem {
    id: string;
    message: string;
    kind: ToastKind;
}

interface ToastStackProps {
    toasts: ToastItem[];
    onDismiss: (id: string) => void;
}

const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss }) => {
    if (!toasts.length) return null;
    return (
        <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)]">
            {toasts.map(t => (
                <button
                    key={t.id}
                    type="button"
                    onClick={() => onDismiss(t.id)}
                    className={`text-left rounded-lg px-4 py-3 text-sm shadow-lg border ${
                        t.kind === 'error'
                            ? 'bg-red-50 dark:bg-red-950/80 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                            : t.kind === 'success'
                                ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                                : 'bg-surface-light dark:bg-surface-dark border-border-sepia dark:border-border-bronze text-text-brown dark:text-text-cream'
                    }`}
                >
                    {t.message}
                </button>
            ))}
        </div>
    );
};

export default ToastStack;
