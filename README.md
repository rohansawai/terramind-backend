# Terramind Backend (GEE Runner)

This is a FastAPI backend for running Google Earth Engine (GEE) Python scripts, designed to work with a Next.js frontend.

## Features
- Accepts Python code via `/run` endpoint, authenticates with GEE, and returns results (tile URLs, GeoJSON, etc.)
- Secure: Reads GEE credentials from environment variables
- CORS enabled for frontend integration

## Deployment on Railway

### 1. Prerequisites
- Railway account
- GEE service account email and key JSON

### 2. Files
- `gee_runner_service.py` (main backend)
- `requirements.txt` (Python dependencies)
- `Procfile` (for Railway web process)

### 3. Environment Variables (set in Railway dashboard)
- `GEE_SERVICE_ACCOUNT`: Your GEE service account email
- `GEE_KEY_JSON`: The contents of your GEE service account key JSON file (as a single line or block)

### 4. Deploy Steps
1. Push this repo to GitHub
2. Create a new Railway project and link your repo
3. Set the environment variables above
4. Railway will auto-detect and deploy the FastAPI service

### 5. Connect from Next.js Frontend
- Set the backend URL in your frontend to the Railway deployment URL
- Use the `/run` endpoint to submit GEE Python code and receive results

---

For questions, see the code or open an issue. 