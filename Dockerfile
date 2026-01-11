# Build Stage for Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Runtime Stage for Backend
FROM python:3.10-slim

# Install system dependencies required for OpenCV and potential OCR tools
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend requirements and install
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend ./backend

# Copy frontend build artifacts
COPY --from=frontend-builder /app/dist ./static

# Expose port
EXPOSE 8000

# Run FastAPI app
# We need to serve static files from FastAPI as well if we want a single container.
# For now, we assume the backend just serves API, but for a "Web OCR App", 
# we usually want to serve the frontend too.
# I will modify main.py to serve static files in the next step or 
# relies on Nginx in docker-compose. 
# Given "Technical Architecture" says "Docker + Docker Compose", 
# it's better to keep them separate or use the python to serve everything for simplicity in one container.
# Let's start the API.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
