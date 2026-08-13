import React from 'react';
import { UploadCloud, ClipboardPaste, FileImage, Loader2 } from './Icon';

interface EmptyStateProps {
    isLoading: boolean;
}

/** 无历史记录时的引导页 */
const EmptyState: React.FC<EmptyStateProps> = ({ isLoading }) => {
    if (isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-brown/50 dark:text-white/40">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">正在加载历史记录…</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="max-w-md w-full text-center">
                <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center mb-6">
                    <FileImage className="w-10 h-10 text-primary" />
                </div>
                <h2 className="text-xl font-bold text-text-brown dark:text-text-cream mb-2">开始识别第一份文档</h2>
                <p className="text-sm text-text-brown/60 dark:text-white/50 leading-relaxed mb-8">
                    支持图片(照片、截图)与 PDF 文件,<br />识别结果自动保存,换设备打开也能看到。
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                    <div className="p-4 rounded-lg bg-surface-light dark:bg-white/5 border border-border-sepia dark:border-border-bronze">
                        <UploadCloud className="w-5 h-5 text-primary mb-2" />
                        <p className="text-xs font-bold text-text-brown dark:text-text-cream">点击上传</p>
                        <p className="text-[11px] text-text-brown/50 dark:text-white/40 mt-1">使用顶部「上传识别」按钮,支持多选</p>
                    </div>
                    <div className="p-4 rounded-lg bg-surface-light dark:bg-white/5 border border-border-sepia dark:border-border-bronze">
                        <FileImage className="w-5 h-5 text-primary mb-2" />
                        <p className="text-xs font-bold text-text-brown dark:text-text-cream">拖拽文件</p>
                        <p className="text-[11px] text-text-brown/50 dark:text-white/40 mt-1">把图片或 PDF 直接拖进本窗口</p>
                    </div>
                    <div className="p-4 rounded-lg bg-surface-light dark:bg-white/5 border border-border-sepia dark:border-border-bronze">
                        <ClipboardPaste className="w-5 h-5 text-primary mb-2" />
                        <p className="text-xs font-bold text-text-brown dark:text-text-cream">粘贴截图</p>
                        <p className="text-[11px] text-text-brown/50 dark:text-white/40 mt-1">截图后按 Ctrl+V 即可直接识别</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EmptyState;
