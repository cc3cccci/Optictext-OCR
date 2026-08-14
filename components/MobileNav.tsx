import React from 'react';
import { Camera, LayoutGrid, Search } from './Icon';

interface MobileNavProps {
    view: 'library' | 'workspace';
    onLibrary: () => void;
    onCamera: () => void;
    onSearch: () => void;
}

const MobileNav: React.FC<MobileNavProps> = ({ view, onLibrary, onCamera, onSearch }) => (
    <nav className="lg:hidden shrink-0 z-40 border-t border-line dark:border-line-dark bg-surface/95 dark:bg-surface-dark/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-3 items-end px-6 pt-2 pb-3">
            <button
                type="button"
                onClick={onLibrary}
                className={`flex flex-col items-center gap-1 text-[11px] ${view === 'library' ? 'text-amber-600 dark:text-amber-400' : 'text-muted'}`}
            >
                <LayoutGrid className="w-5 h-5" />
                库
            </button>
            <button
                type="button"
                onClick={onCamera}
                className="flex flex-col items-center -mt-6"
                aria-label="拍照识别"
            >
                <span className="w-14 h-14 rounded-full bg-primary text-white shadow-lg shadow-primary/30 flex items-center justify-center">
                    <Camera className="w-6 h-6" />
                </span>
                <span className="text-[11px] mt-1 text-primary font-medium">拍照</span>
            </button>
            <button
                type="button"
                onClick={onSearch}
                className="flex flex-col items-center gap-1 text-[11px] text-muted"
            >
                <Search className="w-5 h-5" />
                搜索
            </button>
        </div>
    </nav>
);

export default MobileNav;
