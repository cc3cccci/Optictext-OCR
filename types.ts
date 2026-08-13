export enum OCRStatus {
    Ready = 'READY',
    Processing = 'PROCESSING',
    Error = 'ERROR'
}

/** 单条识别分段:文本、置信度与外接矩形坐标(相对预览图的像素坐标) */
export interface OCRSegment {
    text: string;
    confidence: number;
    box: [number, number, number, number] | null;
}

export interface DocumentScan {
    id: string;
    title: string;
    date: string;              // ISO 时间串
    thumbnailUrl: string;      // 后端缩略图 URL,处理中为临时 blob URL
    fullImageUrl: string;
    extractedText: string;
    status: OCRStatus;
    fileSize: number;          // 字节数
    confidence: number;        // 0-100
    processingTime: number;    // 秒
    imageWidth: number;
    imageHeight: number;
    pageCount: number;
    segments?: OCRSegment[];   // 选中记录时按需加载
    /** 仅存在于前端内存的临时条目(处理中/失败),未写入后端历史 */
    isLocal?: boolean;
}
