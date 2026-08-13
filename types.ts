export enum OCRStatus {
    Ready = 'READY',
    Processing = 'PROCESSING',
    Error = 'ERROR'
}

export type LayoutMode = 'raw' | 'paragraph' | 'single';

export type WorkspaceMode = 'proof' | 'read' | 'image';

export type LibraryFilter = 'all' | 'processing' | 'error' | 'image' | 'pdf';

export type AppView = 'library' | 'workspace';

/** 单条识别分段:稳定 id 用于图文互链 */
export interface OCRSegment {
    id: string;
    text: string;
    confidence: number;
    box: [number, number, number, number] | null;
    page?: number;
}

export interface ScanPage {
    index: number;
    imageUrl: string;
    imageFile?: string;
    width: number;
    height: number;
    segments: OCRSegment[];
}

export interface DuplicateHint {
    id: string;
    title: string;
}

export interface DocumentScan {
    id: string;
    title: string;
    date: string;
    thumbnailUrl: string;
    fullImageUrl: string;
    extractedText: string;
    textPreview?: string;
    status: OCRStatus;
    fileSize: number;
    confidence: number;
    processingTime: number;
    imageWidth: number;
    imageHeight: number;
    pageCount: number;
    pageDone: number;
    errorMessage?: string;
    layoutMode: LayoutMode;
    ignoreHeader: number;
    ignoreFooter: number;
    segments?: OCRSegment[];
    pages?: ScanPage[];
    originalFile?: string;
    tags: string[];
    pinned: boolean;
    contentHash?: string;
    duplicateOf?: DuplicateHint;
    /** 仅存在于前端内存的临时条目(上传尚未拿到服务端 id) */
    isLocal?: boolean;
}
