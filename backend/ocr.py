import cv2
import numpy as np
from rapidocr_onnxruntime import RapidOCR
from typing import List, Tuple, Union

class OCRProcessor:
    def __init__(self):
        # Initialize RapidOCR. 
        # By default this uses the built-in models (usually lightweight mobile versions).
        # To use PP-OCRv4 Server models, one would download the .onnx files and pass 
        # det_model_path='path/to/server_det.onnx', rec_model_path='path/to/server_rec.onnx'
        # For now, we initialize with defaults to ensure the environment works, 
        # but the structure allows easy swapping.
        self.ocr_engine = RapidOCR()

    def process_image(self, image_content: bytes) -> dict:
        """
        Process image bytes and return combined text and confidence.
        """
        # Decode image using OpenCV
        nparr = np.frombuffer(image_content, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise ValueError("Could not decode image")

        # Run OCR
        # result is a list of [box, text, confidence]
        result, elapse = self.ocr_engine(img)

        if not result:
            return {
                "text": "",
                "confidence": 0.0,
                "segments": []
            }

        extracted_text_lines = []
        total_confidence = 0.0
        segments = []

        for item in result:
            # item structure: [box_coordinates, text, confidence]
            text = item[1]
            conf = item[2]
            
            extracted_text_lines.append(text)
            total_confidence += conf
            segments.append({
                "text": text,
                "confidence": conf,
                # box is optional for now, can add if needed for overlay
            })

        # Feature F8: Join with newlines to preserve paragraphs
        full_text = "\n".join(extracted_text_lines)
        avg_confidence = total_confidence / len(result) if result else 0.0

        return {
            "text": full_text,
            "confidence": avg_confidence,
            "segments": segments,
            "processing_time": elapse
        }
