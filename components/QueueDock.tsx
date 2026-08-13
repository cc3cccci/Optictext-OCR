import React from 'react';
import { Loader2 } from './Icon';
import { DocumentScan } from '../types';

interface QueueDockProps {
    queue: DocumentScan[];
    nowTs: number;
    onOpen: (id: string) => void;
}

const QueueDock: React.FC<QueueDockProps> = ({ queue, nowTs, onOpen }) => {
    if (!queue.length) return null;

    return (
        <div className="shrink-0 border-t border-line dark:border-line-dark bg-surface/95 dark:bg-surface-dark/95 backdrop-blur-md px-3 sm:px-4 py-2 z-30">
            <div className="flex items-center gap-2 overflow-x-auto">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted shrink-0">队列 {queue.length}</span>
                {queue.map((scan, i) => {
                    const elapsed = Math.max(0, Math.round((nowTs - new Date(scan.date).getTime()) / 1000));
                    const running = i === 0;
                    return (
                        <button
                            key={scan.id}
                            type="button"
                            onClick={() => onOpen(scan.id)}
                            className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${
                                running
                                    ? 'border-primary/40 bg-primary/10 text-primary'
                                    : 'border-line dark:border-line-dark text-muted'
                            }`}
                        >
                            {running && <Loader2 className="w-3 h-3 animate-spin" />}
                            <span className="max-w-[10rem] truncate">{scan.title}</span>
                            <span className="font-mono text-[10px] opacity-80">
                                {scan.pageCount > 1 ? `${Math.max(1, scan.pageDone)}/${scan.pageCount} · ` : ''}
                                {running ? `${elapsed}s` : '等待'}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default QueueDock;
