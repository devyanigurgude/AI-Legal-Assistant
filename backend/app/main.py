"""
Compatibility shim.

Some setups run Uvicorn as: `uvicorn app.main:app --reload`
This project’s FastAPI instance lives in `backend/main.py`.
"""

from main import app  # noqa: F401

