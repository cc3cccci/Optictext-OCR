import React from 'react';
import { UploadCloud, ClipboardPaste, FileImage, Loader2, Camera } from './Icon';

interface EmptyStateProps {
    isLoading: boolean;
    onUpload: () => void;
    onPaste: () => void;
    onCamera: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ isLoading, onUpload, onPaste, onCamera }) => {
    if (isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted">
                <Loader2 className="w-8 h-8 animate-spin text-amber-600 dark:text-amber-400" />
                <p className="text-sm">正在加载文档库…</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="max-w-md w-full text-center">
                <div className="mx-auto w-20 h-20 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center mb-6 text-amber-600 dark:text-amber-400">
                    <FileImage className="w-10 h-10" />
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400 mb-2">OpticText</p>
                <h2 className="font-serif text-2xl font-semibold text-ink dark:text-ink-dark mb-2">开始识别第一份文档</h2>
                <p className="text-sm text-muted leading-relaxed mb-8">
                    支持图片与 PDF,手机可直接拍照。<br />识别结果保存在本机,局域网即可打开。
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                    <button type="button" onClick={onUpload} className="p-4 rounded-2xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-card hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-lift text-left transition-all duration-200 ease-quiet">
                        <span className="inline-flex w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 items-center justify-center mb-2"><UploadCloud className="w-5 h-5" /></span>
                        <p className="text-xs font-bold">点击上传</p>
                        <p className="text-[11px] text-muted mt-1">图片或 PDF,支持多选</p>
                    </button>
                    <button type="button" onClick={onCamera} className="p-4 rounded-2xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-card hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-lift text-left transition-all duration-200 ease-quiet">
                        <span className="inline-flex w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 items-center justify-center mb-2"><Camera className="w-5 h-5" /></span>
                        <p className="text-xs font-bold">拍照识别</p>
                        <p className="text-[11px] text-muted mt-1">后置相机拍摄纸质文件</p>
                    </button>
                    <button type="button" onClick={onPaste} className="p-4 rounded-2xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-card hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-lift text-left transition-all duration-200 ease-quiet">
                        <span className="inline-flex w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 items-center justify-center mb-2"><ClipboardPaste className="w-5 h-5" /></span>
                        <p className="text-xs font-bold">粘贴截图</p>
                        <p className="text-[11px] text-muted mt-1">截图后按 Ctrl+V</p>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EmptyState;
