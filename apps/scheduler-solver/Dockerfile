# SportsPulse scheduler-solver — Python 3.12 + ortools + FastAPI.
# Built to deploy on Hugging Face Spaces (Docker SDK, port 7860).
# Same image redeploys to Cloud Run / Fly / Oracle Ampere if the free
# tier ever moves on us — no app-code change.

FROM python:3.12-slim

# System deps for ortools (libstdc++, etc) and basic ops hygiene.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first for layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the app.
COPY main.py .

# HF Spaces sends traffic to $PORT (default 7860). Cloud Run uses $PORT
# (default 8080). Honour whichever is set; fall back to 7860 for HF.
ENV PORT=7860
EXPOSE 7860

# Healthcheck wakes the container faster on cold start.
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:${PORT}/health || exit 1

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
