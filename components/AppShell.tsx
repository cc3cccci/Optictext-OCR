import React from 'react';
import { Camera, ClipboardPaste, Moon, Scan, Search, Sun, UploadCloud } from './Icon';

interface AppShellProps {
    isDarkMode: boolean;
    onToggleTheme: () => void;
    onLibrary: () => void;
    onPaste: () => void;
    onUpload: () => void;
    onCamera: () => void;
    onOpenPalette: () => void;
    children: React.ReactNode;
}

const AppShell: React.FC<AppShellProps> = ({
    isDarkMode, onToggleTheme, onLibrary, onPaste, onUpload, onCamera, onOpenPalette, children,
}) => (
    <div className="flex flex-col h-screen w-full bg-bg dark:bg-bg-dark font-sans text-ink dark:text-ink-dark transition-colors duration-300">
        <header className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 border-b border-line dark:border-line-dark bg-surface/90 dark:bg-surface-dark/90 backdrop-blur-md z-30 shrink-0">
            <button type="button" onClick={onLibrary} className="flex items-center gap-2.5 min-w-0">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary text-white">
                    <Scan className="w-4 h-4" />
                </span>
                <span className="text-[17px] font-serif font-semibold tracking-tight">
                    OpticText
                    <span className="hidden sm:inline font-sans font-normal text-muted text-sm ml-1.5">文字识别</span>
                </span>
            </button>

            <button
                type="button"
                onClick={onOpenPalette}
                className="hidden md:flex flex-1 max-w-md items-center gap-2 mx-4 px-3.5 py-2 rounded-full bg-bg dark:bg-bg-dark border border-line dark:border-line-dark text-sm text-muted transition-colors duration-200 ease-quiet hover:border-primary/40"
            >
                <Search className="w-4 h-4" />
                <span className="flex-1 text-left">搜索文档或命令</span>
                <kbd className="text-[10px] px-1.5 py-0.5 rounded-md border border-line dark:border-line-dark">Ctrl K</kbd>
            </button>

            <div className="flex items-center gap-1.5 sm:gap-2">
                <button type="button" onClick={onPaste} className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-full border border-line dark:border-line-dark text-sm transition-colors duration-200 ease-quiet hover:border-primary hover:text-primary" title="粘贴截图">
                    <ClipboardPaste className="w-4 h-4" />
                    <span>粘贴</span>
                </button>
                <button type="button" onClick={onCamera} className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-full border border-line dark:border-line-dark text-sm transition-colors duration-200 ease-quiet hover:border-primary hover:text-primary" title="拍照">
                    <Camera className="w-4 h-4" />
                    <span>拍照</span>
                </button>
                <button type="button" onClick={onUpload} className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-white text-sm font-medium shadow-card transition-all duration-200 ease-quiet hover:bg-primary-dark hover:-translate-y-px">
                    <UploadCloud className="w-4 h-4" />
                    <span>上传</span>
                </button>
                <button type="button" onClick={onToggleTheme} className="w-9 h-9 rounded-full hover:bg-primary/5 dark:hover:bg-white/10 flex items-center justify-center text-amber-600 dark:text-amber-400 transition-colors duration-200 ease-quiet" title="切换主题">
                    {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
            </div>
        </header>
        {children}
    </div>
);

export default AppShell;
