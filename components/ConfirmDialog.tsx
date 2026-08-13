import React from 'react';

interface ConfirmDialogProps {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    title,
    message,
    confirmLabel = '确定',
    danger,
    onConfirm,
    onCancel,
}) => (
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
        <div className="relative w-full max-w-sm rounded-xl bg-bg-cream dark:bg-surface-dark border border-border-sepia dark:border-border-bronze p-5 shadow-2xl">
            <h3 className="text-base font-bold text-text-brown dark:text-text-cream">{title}</h3>
            <p className="mt-2 text-sm text-text-brown/70 dark:text-white/60 leading-relaxed whitespace-pre-wrap">{message}</p>
            <div className="mt-4 flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-3 py-1.5 text-sm rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-text-brown dark:text-text-cream"
                >
                    取消
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    className={`px-3 py-1.5 text-sm rounded-md text-white ${
                        danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-dark'
                    }`}
                >
                    {confirmLabel}
                </button>
            </div>
        </div>
    </div>
);

export default ConfirmDialog;
