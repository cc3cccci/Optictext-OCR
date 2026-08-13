import { useCallback, useEffect, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import { DocumentScan, OCRStatus } from '../types';
import { uploadForOCR } from '../api';
import { compressImageIfNeeded } from '../utils';
import { DEFAULT_IGNORE, MAX_UPLOAD_MB } from '../constants';

interface UseUploadOptions {
    mergeScan: (scan: DocumentScan) => void;
    startPolling: (id: string) => void;
    setScans: Dispatch<SetStateAction<DocumentScan[]>>;
    toast: (message: string, kind?: 'info' | 'success' | 'error') => void;
    onUploaded?: (scan: DocumentScan) => void;
}

export function useUpload({ mergeScan, startPolling, setScans, toast, onUploaded }: UseUploadOptions) {
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    const enqueueUpload = useCallback((rawFile: File) => {
        const isPdf = rawFile.type === 'application/pdf' || rawFile.name.toLowerCase().endsWith('.pdf');
        const isImage = rawFile.type.startsWith('image/');
        if (!isPdf && !isImage) {
            toast(`不支持的文件类型:${rawFile.name}`, 'error');
            return;
        }
        if (rawFile.size > MAX_UPLOAD_MB * 1024 * 1024) {
            toast(`文件过大,上限 ${MAX_UPLOAD_MB}MB`, 'error');
            return;
        }

        const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const blobUrl = isImage ? URL.createObjectURL(rawFile) : '';
        const tempScan: DocumentScan = {
            id: tempId,
            title: rawFile.name,
            date: new Date().toISOString(),
            thumbnailUrl: blobUrl,
            fullImageUrl: blobUrl,
            extractedText: '正在上传…',
            status: OCRStatus.Processing,
            fileSize: rawFile.size,
            confidence: 0,
            processingTime: 0,
            imageWidth: 0,
            imageHeight: 0,
            pageCount: 1,
            pageDone: 0,
            layoutMode: 'paragraph',
            ignoreHeader: DEFAULT_IGNORE,
            ignoreFooter: DEFAULT_IGNORE,
            tags: [],
            pinned: false,
            isLocal: true,
        };
        setScans(prev => [tempScan, ...prev]);
        onUploaded?.(tempScan);

        void (async () => {
            try {
                const file = isImage ? await compressImageIfNeeded(rawFile) : rawFile;
                const scan = await uploadForOCR(file);
                setScans(prev => prev.map(s => (s.id === tempId ? scan : s)));
                if (blobUrl) URL.revokeObjectURL(blobUrl);
                startPolling(scan.id);
                onUploaded?.(scan);
                if (scan.duplicateOf) {
                    toast(`已有相同文件「${scan.duplicateOf.title}」,仍会保存新记录`, 'info');
                }
            } catch (e: any) {
                setScans(prev => prev.map(s => (
                    s.id === tempId
                        ? {
                            ...s,
                            status: OCRStatus.Error,
                            errorMessage: e?.message || '未知错误',
                            extractedText: `识别失败:${e?.message || '未知错误'}`,
                        }
                        : s
                )));
                toast(e?.message || '上传失败', 'error');
            }
        })();
    }, [onUploaded, setScans, startPolling, toast]);

    const processFiles = useCallback((files: File[]) => {
        files.forEach(enqueueUpload);
    }, [enqueueUpload]);

    const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (files.length) processFiles(files);
        event.target.value = '';
    };

    useEffect(() => {
        let dragCounter = 0;
        const hasFiles = (e: DragEvent) => e.dataTransfer?.types?.includes('Files');
        const onDragEnter = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragCounter++;
            setIsDragOver(true);
        };
        const onDragOver = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
        const onDragLeave = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            dragCounter = Math.max(0, dragCounter - 1);
            if (dragCounter === 0) setIsDragOver(false);
        };
        const onDrop = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragCounter = 0;
            setIsDragOver(false);
            const files = Array.from(e.dataTransfer?.files || []);
            if (files.length) processFiles(files);
        };
        window.addEventListener('dragenter', onDragEnter);
        window.addEventListener('dragover', onDragOver);
        window.addEventListener('dragleave', onDragLeave);
        window.addEventListener('drop', onDrop);
        return () => {
            window.removeEventListener('dragenter', onDragEnter);
            window.removeEventListener('dragover', onDragOver);
            window.removeEventListener('dragleave', onDragLeave);
            window.removeEventListener('drop', onDrop);
        };
    }, [processFiles]);

    useEffect(() => {
        const handleGlobalPaste = (event: ClipboardEvent) => {
            const items = event.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    if (blob) {
                        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
                        enqueueUpload(new File([blob], `粘贴图片_${stamp}.png`, { type: item.type }));
                        return;
                    }
                }
            }
        };
        window.addEventListener('paste', handleGlobalPaste);
        return () => window.removeEventListener('paste', handleGlobalPaste);
    }, [enqueueUpload]);

    const handlePasteButton = async () => {
        try {
            if (!navigator.clipboard || !(navigator.clipboard as any).read) {
                throw new Error('Clipboard API unavailable');
            }
            const clipboardItems = await (navigator.clipboard as any).read();
            for (const item of clipboardItems) {
                const imageType = item.types.find((type: string) => type.startsWith('image/'));
                if (imageType) {
                    const blob = await item.getType(imageType);
                    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
                    enqueueUpload(new File([blob], `粘贴图片_${stamp}.png`, { type: imageType }));
                    return;
                }
            }
            toast('剪贴板中没有图片。', 'info');
        } catch {
            toast('请直接按 Ctrl+V(Mac 为 Cmd+V)粘贴图片。', 'info');
        }
    };

    return {
        isDragOver,
        fileInputRef,
        cameraInputRef,
        enqueueUpload,
        processFiles,
        handleFileInput,
        handlePasteButton,
    };
}
