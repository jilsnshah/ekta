# Ekta, as one image: the API serves the built frontend from the same origin.
#
# Two stages so Node is only present while the frontend is compiled -- the
# image that ships carries Python and the build output, nothing else.

# --------------------------------------------------------------------------- #
# 1. Build the frontend
# --------------------------------------------------------------------------- #
FROM node:22-slim AS web

WORKDIR /build

# Dependencies first, so a source-only change does not reinstall them.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# Type-checks and bundles. Fails the build on a type error, which is the point.
RUN npm run build

# --------------------------------------------------------------------------- #
# 2. The service
# --------------------------------------------------------------------------- #
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
# app/main.py looks for ../../frontend/dist relative to itself, which is here.
COPY --from=web /build/dist ./frontend/dist

# Render sets PORT; 8000 keeps `docker run -p 8000:8000` working locally.
ENV PORT=8000
EXPOSE 8000

WORKDIR /app/backend

# Exec form so signals reach uvicorn directly, wrapped in sh because $PORT is
# only known at run time -- Render assigns it.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips '*'"]
