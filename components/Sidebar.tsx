import React, { useMemo, useState } from 'react';
import { Search, FileImage, X, Trash2, Loader2, AlertCircle } from './Icon';
import { DocumentScan, OCRStatus } from '../types';
import { formatDate } from '../utils';

interface SidebarProps {
    scans: DocumentScan[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onDelete: (id: string, e: React.MouseEvent) => void;
    isOpen: boolean;
    onClose: () => void;
    isLoading: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ scans, selectedId, onSelect, onDelete, isOpen, onClose, isLoading }) => {
    const [query, setQuery] = useState('');

    // 按标题与识别文本过滤
    const filteredScans = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return scans;
        return scans.filter(s =>
            s.title.toLowerCase().includes(q) ||
            s.extractedText.toLowerCase().includes(q)
        );
    }, [scans, query]);

    return (
        <>
            {/* 移动端遮罩 */}
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
                            历史记录
                        </h3>
                        <button
                            onClick={onClose}
                            className="lg:hidden p-2 -mr-2 text-text-brown/50 hover:text-primary transition-colors rounded-full hover:bg-black/5 dark:hover:bg-white/5"
                            aria-label="关闭历史记录"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="relative group">
                        <Search className="absolute left-3 top-2.5 text-text-brown/40 w-4 h-4 group-focus-within:text-primary transition-colors" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="搜索标题或识别内容…"
                            className="w-full pl-9 pr-8 py-2 text-sm bg-white dark:bg-bg-dark border border-border-sepia dark:border-border-bronze rounded-md 
                            text-text-brown dark:text-text-cream focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary 
                            placeholder-text-brown/30 dark:placeholder-white/20 transition-all shadow-sm"
                        />
                        {query && (
                            <button
                                onClick={() => setQuery('')}
                                className="absolute right-2 top-2 p-0.5 text-text-brown/40 hover:text-primary rounded-full"
                                aria-label="清空搜索"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar bg-bg-cream/50 dark:bg-transparent">
                    {isLoading && scans.length === 0 && (
                        <div className="flex items-center justify-center gap-2 py-10 text-text-brown/40 dark:text-white/30 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            加载中…
                        </div>
                    )}

                    {!isLoading && scans.length === 0 && (
                        <div className="text-center py-10 px-4 text-text-brown/40 dark:text-white/30 text-sm leading-relaxed">
                            暂无识别记录<br />上传图片或 PDF 开始使用
                        </div>
                    )}

                    {scans.length > 0 && filteredScans.length === 0 && (
                        <div className="text-center py-10 px-4 text-text-brown/40 dark:text-white/30 text-sm">
                            没有匹配「{query}」的记录
                        </div>
                    )}

                    {filteredScans.map((scan) => {
                        const isSelected = scan.id === selectedId;
                        return (
                            <div
                                key={scan.id}
                                onClick={() => onSelect(scan.id)}
                                className={`
                                    relative flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200 group
                                    ${isSelected
                                        ? 'bg-white dark:bg-surface-dark-lighter border-primary/40 shadow-sm ring-1 ring-primary/20'
                                        : 'border-transparent hover:bg-white/50 dark:hover:bg-white/5 hover:border-border-sepia dark:hover:border-border-bronze'
                                    }
                                `}
                            >
                                <div className="w-12 h-16 bg-gray-200 dark:bg-black/20 rounded-md overflow-hidden shrink-0 border border-border-sepia dark:border-border-bronze relative">
                                    {scan.status === OCRStatus.Processing ? (
                                        <div className="w-full h-full flex items-center justify-center bg-bg-cream dark:bg-surface-dark animate-pulse">
                                            <FileImage className="text-text-brown/20 dark:text-white/20 w-6 h-6" />
                                        </div>
                                    ) : scan.thumbnailUrl ? (
                                        <div
                                            className="w-full h-full bg-cover bg-center"
                                            style={{ backgroundImage: `url(${scan.thumbnailUrl})` }}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-bg-cream dark:bg-surface-dark">
                                            <FileImage className="text-text-brown/20 dark:text-white/20 w-6 h-6" />
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h4 className={`text-sm font-semibold truncate transition-colors pr-6 ${isSelected ? 'text-primary' : 'text-text-brown dark:text-text-cream group-hover:text-primary'}`}>
                                        {scan.title}
                                    </h4>
                                    <p className="text-xs text-text-brown/50 dark:text-white/40 mt-1">
                                        {formatDate(scan.date)}
                                    </p>

                                    <div className="flex items-center gap-1.5 mt-2">
                                        {scan.status === OCRStatus.Ready && (
                                            <>
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                                <span className="text-[10px] text-text-brown/40 dark:text-white/30 font-medium tracking-wide">
                                                    已完成{scan.pageCount > 1 ? ` · ${scan.pageCount} 页` : ''}
                                                </span>
                                            </>
                                        )}
                                        {scan.status === OCRStatus.Processing && (
                                            <>
                                                <Loader2 className="w-3 h-3 text-primary animate-spin" />
                                                <span className="text-[10px] text-primary font-medium tracking-wide">识别中</span>
                                            </>
                                        )}
                                        {scan.status === OCRStatus.Error && (
                                            <>
                                                <AlertCircle className="w-3 h-3 text-red-500" />
                                                <span className="text-[10px] text-red-500 font-medium tracking-wide">失败</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* 删除按钮(悬停显示) */}
                                <button
                                    onClick={(e) => onDelete(scan.id, e)}
                                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-text-brown/40 dark:text-white/40 hover:text-red-600 dark:hover:text-red-400 rounded transition-all"
                                    title="删除该记录"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        );
                    })}
                </div>

                <div className="p-3 border-t border-border-sepia dark:border-border-bronze bg-surface-light dark:bg-surface-dark-lighter text-center">
                    <span className="text-xs text-text-brown/50 dark:text-white/40">
                        {query ? `匹配 ${filteredScans.length} / ${scans.length} 条记录` : `共 ${scans.length} 条记录`}
                    </span>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
