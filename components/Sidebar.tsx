import React from 'react';
import { Search, History, FileImage, X, Trash2 } from './Icon';
import { DocumentScan, OCRStatus } from '../types';

interface SidebarProps {
    scans: DocumentScan[];
    selectedId: string;
    onSelect: (id: string) => void;
    onDelete: (id: string, e: React.MouseEvent) => void;
    isOpen: boolean;
    onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ scans, selectedId, onSelect, onDelete, isOpen, onClose }) => {

    // Helper to format date nicely
    const formatDate = (isoString: string) => {
        const date = new Date(isoString);
        // If today
        if (new Date().toDateString() === date.toDateString()) {
            return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
        <>
            {/* Mobile Backdrop */}
            <div
                className={`
                    lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300
                    ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
                `}
                onClick={onClose}
                aria-hidden="true"
            />

            <aside
                className={`
                    fixed inset-y-0 left-0 z-50 w-[85vw] sm:w-80 bg-surface-light dark:bg-surface-dark-lighter
                    border-r border-border-sepia dark:border-border-bronze flex flex-col 
                    transition-all duration-300 ease-in-out shadow-2xl lg:shadow-none
                    ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
                    lg:relative lg:translate-x-0 lg:z-auto shrink-0
                    ${!isOpen ? 'lg:-ml-80' : 'lg:ml-0'}
                `}
            >
                <div className="p-4 border-b border-border-sepia dark:border-border-bronze bg-surface-light dark:bg-surface-dark-lighter flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-text-brown/60 dark:text-primary/70 font-sans">
                            History
                        </h3>
                        <button
                            onClick={onClose}
                            className="lg:hidden p-2 -mr-2 text-text-brown/50 hover:text-primary transition-colors rounded-full hover:bg-black/5 dark:hover:bg-white/5"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="relative group">
                        <Search className="absolute left-3 top-2.5 text-text-brown/40 w-4 h-4 group-focus-within:text-primary transition-colors" />
                        <input
                            type="text"
                            placeholder="Search history..."
                            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-bg-dark border border-border-sepia dark:border-border-bronze rounded-md 
                            text-text-brown dark:text-text-cream focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary 
                            placeholder-text-brown/30 dark:placeholder-white/20 transition-all shadow-sm"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar bg-bg-cream/50 dark:bg-transparent">
                    {scans.map((scan) => {
                        const isSelected = scan.id === selectedId;
                        return (
                            <div
                                key={scan.id}
                                onClick={() => onSelect(scan.id)}
                                className={`
                                    flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200 group
                                    ${isSelected
                                        ? 'bg-white dark:bg-surface-dark-lighter border-primary/40 shadow-sm ring-1 ring-primary/20'
                                        : 'border-transparent hover:bg-white/50 dark:hover:bg-white/5 hover:border-border-sepia dark:hover:border-border-bronze'
                                    }
                                `}
                            >
                                <div className="w-12 h-16 bg-gray-200 dark:bg-black/20 rounded-md overflow-hidden shrink-0 border border-border-sepia dark:border-border-bronze relative">
                                    {scan.status === OCRStatus.Processing ? (
                                        <div className="w-full h-full flex items-center justify-center bg-bg-cream dark:bg-surface-dark animate-pulse">
                                            <FileImage className="text-text-brown/20 w-6 h-6" />
                                        </div>
                                    ) : (
                                        <div
                                            className="w-full h-full bg-cover bg-center sepia-[.3]"
                                            style={{ backgroundImage: `url(${scan.thumbnailUrl})` }}
                                        />
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h4 className={`text-sm font-semibold truncate transition-colors ${isSelected ? 'text-primary' : 'text-text-brown dark:text-text-cream group-hover:text-primary'}`}>
                                        {scan.title}
                                    </h4>
                                    <p className="text-xs text-text-brown/50 dark:text-white/40 mt-1">
                                        {formatDate(scan.date)}
                                    </p>

                                    <div className="flex items-center gap-1.5 mt-2">
                                        {scan.status === OCRStatus.Ready && (
                                            <>
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                                <span className="text-[10px] text-text-brown/40 dark:text-white/30 uppercase font-medium tracking-wide">Ready</span>
                                            </>
                                        )}
                                        {scan.status === OCRStatus.Processing && (
                                            <>
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></div>
                                                <span className="text-[10px] text-primary uppercase font-medium tracking-wide">Processing</span>
                                            </>
                                        )}
                                    </div>
                                    <button
                                        onClick={(e) => onDelete(scan.id, e)}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-text-brown/40 hover:text-red-600 dark:hover:text-red-400 rounded transition-all"
                                        title="Delete Scan"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="p-3 border-t border-border-sepia dark:border-border-bronze bg-surface-light dark:bg-surface-dark-lighter">
                    <button className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-sm font-medium text-text-brown/70 dark:text-text-cream/80 hover:bg-primary/10 hover:text-primary transition-colors">
                        <History className="w-4 h-4" />
                        <span>View Full History</span>
                    </button>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;