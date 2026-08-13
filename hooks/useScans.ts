import { useCallback, useEffect, useRef, useState } from 'react';
import { DocumentScan, LayoutMode, OCRStatus } from '../types';
import {
    batchDeleteScans,
    deleteScanById,
    fetchScanDetail,
    fetchScans,
    patchScan,
    pollScanUntilDone,
    reflowScan,
    retryScan,
    saveScanText,
} from '../api';

export function useScans() {
    const [scans, setScans] = useState<DocumentScan[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const pollingRef = useRef<Set<string>>(new Set());
    const searchTimer = useRef<number | null>(null);

    const mergeScan = useCallback((scan: DocumentScan) => {
        setScans(prev => {
            const idx = prev.findIndex(s => s.id === scan.id);
            if (idx < 0) return [scan, ...prev];
            const next = [...prev];
            next[idx] = { ...next[idx], ...scan };
            return next;
        });
    }, []);

    const startPolling = useCallback((id: string) => {
        if (pollingRef.current.has(id)) return;
        pollingRef.current.add(id);
        void pollScanUntilDone(id, mergeScan, () => !pollingRef.current.has(id))
            .catch(() => { /* 取消或网络错误由下一次刷新兜底 */ })
            .finally(() => { pollingRef.current.delete(id); });
    }, [mergeScan]);

    const loadHistory = useCallback(async () => {
        setIsLoading(true);
        try {
            const list = await fetchScans();
            setScans(prev => {
                const locals = prev.filter(s => s.isLocal);
                const ids = new Set(list.map(s => s.id));
                return [...locals.filter(s => !ids.has(s.id)), ...list];
            });
            setError(null);
            list.filter(s => s.status === OCRStatus.Processing).forEach(s => startPolling(s.id));
        } catch (e: any) {
            setError(e?.message || '加载历史记录失败');
        } finally {
            setIsLoading(false);
        }
    }, [startPolling]);

    useEffect(() => { void loadHistory(); }, [loadHistory]);

    const searchRemote = useCallback((q: string) => {
        if (searchTimer.current) window.clearTimeout(searchTimer.current);
        const run = () => {
            fetchScans(q.trim() || undefined).then(list => {
                setScans(prev => {
                    const locals = prev.filter(s => s.isLocal || s.status === OCRStatus.Processing);
                    const ids = new Set(list.map(s => s.id));
                    return [...locals.filter(s => !ids.has(s.id)), ...list];
                });
            }).catch(() => { /* 本地过滤仍可用 */ });
        };
        if (!q.trim()) {
            run();
            return;
        }
        searchTimer.current = window.setTimeout(run, 300);
    }, []);

    const loadDetail = useCallback(async (id: string) => {
        const scan = await fetchScanDetail(id);
        mergeScan(scan);
        return scan;
    }, [mergeScan]);

    const updateText = useCallback(async (id: string, text: string) => {
        setScans(prev => prev.map(s => (s.id === id ? { ...s, extractedText: text } : s)));
        if (id.startsWith('local-')) return;
        await saveScanText(id, text);
    }, []);

    const updateMeta = useCallback(async (
        id: string,
        body: { title?: string; tags?: string[]; pinned?: boolean },
    ) => {
        setScans(prev => prev.map(s => (
            s.id === id
                ? {
                    ...s,
                    ...(body.title !== undefined ? { title: body.title } : {}),
                    ...(body.tags !== undefined ? { tags: body.tags } : {}),
                    ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
                }
                : s
        )));
        if (id.startsWith('local-')) return;
        const scan = await patchScan(id, body);
        mergeScan(scan);
        return scan;
    }, [mergeScan]);

    const remove = useCallback(async (id: string, isLocal?: boolean) => {
        if (!isLocal) await deleteScanById(id);
        pollingRef.current.delete(id);
        setScans(prev => prev.filter(s => s.id !== id));
    }, []);

    const removeMany = useCallback(async (ids: string[]) => {
        const localIds = ids.filter(id => id.startsWith('local-'));
        const remoteIds = ids.filter(id => !id.startsWith('local-'));
        if (remoteIds.length) await batchDeleteScans(remoteIds);
        ids.forEach(id => pollingRef.current.delete(id));
        const drop = new Set([...localIds, ...remoteIds]);
        setScans(prev => prev.filter(s => !drop.has(s.id)));
    }, []);

    const retry = useCallback(async (id: string) => {
        const scan = await retryScan(id);
        mergeScan(scan);
        startPolling(scan.id);
        return scan;
    }, [mergeScan, startPolling]);

    const reflow = useCallback(async (
        id: string,
        body: { layout_mode?: LayoutMode; ignore_header?: number; ignore_footer?: number },
    ) => {
        const scan = await reflowScan(id, body);
        mergeScan(scan);
        return scan;
    }, [mergeScan]);

    return {
        scans,
        setScans,
        isLoading,
        error,
        mergeScan,
        startPolling,
        loadHistory,
        searchRemote,
        loadDetail,
        updateText,
        updateMeta,
        remove,
        removeMany,
        retry,
        reflow,
        pollingRef,
    };
}
