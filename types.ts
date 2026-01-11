export enum OCRStatus {
    Ready = 'READY',
    Processing = 'PROCESSING',
    Error = 'ERROR'
}

export interface DocumentScan {
    id: string;
    title: string;
    date: string; // ISO date string
    thumbnailUrl: string;
    fullImageUrl: string;
    extractedText: string;
    status: OCRStatus;
    fileSize: string;
    confidence: number;
    wordCount: number;
}
