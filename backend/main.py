from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import time
import os
from typing import List, Optional

# Initialize OCR Processor
# We do this globally so the model is loaded once at startup
try:
    from .ocr import OCRProcessor
except ImportError:
    from ocr import OCRProcessor

app = FastAPI(title="OpticText OCR API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    ocr_service = OCRProcessor()
except Exception as e:
    print(f"Error initializing OCR engine: {e}")
    ocr_service = None

class OCRResponse(BaseModel):
    text: str
    confidence: float
    processing_time: float
    segments: Optional[List[dict]] = None
    message: str = "Success"

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "model_loaded": ocr_service is not None}

@app.post("/api/ocr", response_model=OCRResponse)
async def ocr_endpoint(file: UploadFile = File(...)):
    if not ocr_service:
        raise HTTPException(status_code=503, detail="OCR Service not initialized")
    
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    start_time = time.time()
    try:
        contents = await file.read()
        
        # Process the image
        result = ocr_service.process_image(contents)
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # RapidOCR returns its own 'processing_time', but we track total request time too
        # We can combine or just use our own.
        
        return OCRResponse(
            text=result["text"],
            confidence=result["confidence"],
            processing_time=total_time, # Total API time
            segments=result["segments"]
        )

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

# Mount static files (Frontend)
# In Docker, we copy 'dist' to '/app/static'. 
# 'main.py' is in '/app/backend', so we look in '../static'.
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static")

if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
