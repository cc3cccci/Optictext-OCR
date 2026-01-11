import { DocumentScan, OCRStatus } from './types';

export const MOCK_SCANS: DocumentScan[] = [
    {
        id: '1',
        title: 'Invoice_Scan_001.jpg',
        date: new Date().toISOString(),
        thumbnailUrl: 'https://picsum.photos/id/1/200/300',
        fullImageUrl: 'https://picsum.photos/id/1/1200/1600',
        extractedText: `INVOICE #1024
DATE: October 24, 2023
BILL TO:
Acme Corp Inc.
123 Business Rd.
Tech City, CA 90210
------------------------------------------------
DESCRIPTION           QTY    PRICE    TOTAL
------------------------------------------------
Web Design Service    1      $2,500   $2,500.00
Hosting (Yearly)      1      $200     $200.00
Domain Registration   2      $15      $30.00
------------------------------------------------
SUBTOTAL                              $2,730.00
TAX (8%)                              $218.40
------------------------------------------------
TOTAL                                 $2,948.40
------------------------------------------------
Thank you for your business!
Payment is due within 30 days.`,
        status: OCRStatus.Ready,
        fileSize: '2.4 MB',
        confidence: 98,
        wordCount: 85
    },
    {
        id: '2',
        title: 'Receipt_Walmart.jpg',
        date: new Date(Date.now() - 86400000).toISOString(),
        thumbnailUrl: 'https://picsum.photos/id/24/200/300',
        fullImageUrl: 'https://picsum.photos/id/24/1200/1600',
        extractedText: `WALMART
Store #1234
Manager: Jane Doe
-------------------------
Milk 1Gal       $3.49
Eggs 12ct       $2.99
Bread           $1.50
-------------------------
Total           $7.98
-------------------------
Thank you for shopping!`,
        status: OCRStatus.Ready,
        fileSize: '1.1 MB',
        confidence: 94,
        wordCount: 32
    },
    {
        id: '3',
        title: 'Contract_Draft_v2.pdf',
        date: new Date(Date.now() - 172800000).toISOString(),
        thumbnailUrl: 'https://picsum.photos/id/42/200/300',
        fullImageUrl: 'https://picsum.photos/id/42/1200/1600',
        extractedText: `CONTRACT AGREEMENT

This Agreement is made this 22nd day of October, 2023.

BETWEEN:
Client Name (The "Client")
AND
Provider Name (The "Provider")

1. SERVICES
The Provider agrees to deliver the following services...`,
        status: OCRStatus.Ready,
        fileSize: '4.5 MB',
        confidence: 99,
        wordCount: 1205
    }
];
