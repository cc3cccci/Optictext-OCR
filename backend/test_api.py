import requests
import sys
import os

def test_ocr():
    url = "http://localhost:8000/api/ocr"
    
    # Generate a dummy image to test with
    # Create a simple image using Pillow
    try:
        from PIL import Image
        import io
        
        img = Image.new('RGB', (100, 30), color = (73, 109, 137))
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='PNG')
        img_byte_arr = img_byte_arr.getvalue()
        
        files = {"file": ("test.png", img_byte_arr, "image/png")}
        
    except ImportError:
        print("Pillow not installed, skipping image generation test part (or using fallback if implemented)")
        return
    
    print(f"Sending request to {url}...")
    try:
        response = requests.post(url, files=files)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            if "text" in data:
                print("SUCCESS: OCR endpoint returned text.")
            else:
                print("FAILURE: Response JSON missing 'text' field.")
        else:
            print("FAILURE: Status code is not 200.")
            
    except Exception as e:
        print(f"ERROR: Could not connect to backend. {e}")

if __name__ == "__main__":
    test_ocr()
