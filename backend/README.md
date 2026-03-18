# Backend (FastAPI)

This service powers contract upload, AI analysis, reporting, and authentication.

## Requirements
- Python 3.10+
- PostgreSQL database

## Setup
```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

## Run
```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

## Environment Variables
See `backend/.env.example` for the full list.

## Key Endpoints
- `POST /auth/register`
- `POST /auth/login`
- `POST /contracts` (upload contract)
- `GET /contracts`
- `GET /contracts/{contract_id}`
- `POST /contracts/{contract_id}/analyze`
- `GET /report/{contract_id}`
- `POST /query`
- `POST /query/v2`
- `POST /explain-clause`
