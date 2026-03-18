# AI Legal Assistant

[![CI](https://github.com/devyanigurgude/AI-Legal-Assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/devyanigurgude/AI-Legal-Assistant/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI Legal Assistant is a full‑stack web app that helps analyze contract PDFs with AI‑powered summaries, risk signals, and clause insights. The backend is a FastAPI service with a Postgres database, and the frontend is a React + Vite dashboard.

**Key Features**
- Upload PDF contracts and extract text
- AI‑generated summaries and risk classification
- Clause analysis with explanations and suggestions
- Contract list, details, and PDF report download
- Authentication (register/login)
- Optional RAG chat over contract content

**Tech Stack**
- Frontend: React, TypeScript, Vite, Tailwind, shadcn‑ui
- Backend: FastAPI, SQLAlchemy, PostgreSQL
- AI: Google Gemini (text + embeddings), FAISS, NumPy

**Repository Structure**
- `frontend/` React UI
- `backend/` FastAPI API + database models

## Getting Started

### 1) Backend
1. Create a Python virtual environment and install dependencies:
   ```bash
   cd backend
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   ```
2. Create your environment file:
   ```bash
   copy .env.example .env
   ```
3. Run the API server:
   ```bash
   uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```

### 2) Frontend
1. Install dependencies and start the dev server:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. The frontend expects the API at `http://127.0.0.1:8000` (see `frontend/src/services/apiService.ts`).

## Configuration

Backend environment variables are defined in `backend/.env.example`:
- `GEMINI_API_KEY` (required)
- `DATABASE_URL` (required)
- `JWT_SECRET_KEY` (recommended)
- `ENABLE_CHAT_STREAMING` (optional)
- `ENABLE_CHAT_MEMORY` (optional)
- `ENABLE_CHAT_CITATIONS` (optional)

Frontend environment variables are optional. See `frontend/.env.example`.

## Scripts

Frontend:
- `npm run dev` – Start Vite dev server
- `npm run build` – Production build
- `npm run preview` – Preview build

Backend:
- `uvicorn main:app --reload` – Start API server

## Notes
- Database migrations live in `backend/alembic/`.
- Uploaded files are stored in `backend/uploads/`.
