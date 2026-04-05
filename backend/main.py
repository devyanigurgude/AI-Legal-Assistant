from click import prompt
from PyPDF2 import PdfReader
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Response
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from database import engine, SessionLocal
from models import Base, Contract, User, ChatMessage
import shutil
import os
import json
import re
import hashlib
import logging
from io import BytesIO
from pathlib import Path
from dotenv import load_dotenv
from google import genai  # Gemini client
from google.genai import types
from google.genai import errors as genai_errors
import faiss
import numpy as np
from auth import router as auth_router
from fastapi.middleware.cors import CORSMiddleware
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer
from pydantic import BaseModel
from typing import List
app = FastAPI()
logger = logging.getLogger("contract-ai")

allowed_origins = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Include auth endpoints
app.include_router(auth_router)
class ClauseExplainRequest(BaseModel):
    clause_text: str
    clause_type: str
    risk_level: str


class ClauseExplainResponse(BaseModel):
    simple_explanation: str
    example: str
    risk_reason: str
    suggestions: List[str]
    complexity_level: str

# For now, store vectors in-memory
embedding_dim = 1536  # size of Gemini embeddings
index = faiss.IndexFlatL2(embedding_dim)
vector_to_metadata = []

load_dotenv()

# Chat enhancements are opt-in so existing behavior remains unchanged.
def _env_flag(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


ENABLE_CHAT_STREAMING = _env_flag("ENABLE_CHAT_STREAMING", False)
ENABLE_CHAT_MEMORY = _env_flag("ENABLE_CHAT_MEMORY", False)
ENABLE_CHAT_CITATIONS = _env_flag("ENABLE_CHAT_CITATIONS", False)

# Optional in-memory memory store (only used when ENABLE_CHAT_MEMORY=true)
CHAT_MEMORY: dict[str, list[dict[str, str]]] = {}

# Initialize Gemini client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


def _is_quota_or_rate_error(exc: Exception) -> bool:
    if isinstance(exc, genai_errors.ClientError):
        status = str(getattr(exc, "status_code", ""))
        message = str(exc).lower()
        return status == "429" or "resource_exhausted" in message or "quota" in message or "rate" in message
    msg = str(exc).lower()
    return "resource_exhausted" in msg or "quota" in msg or "rate limit" in msg or "429" in msg


def _safe_generate_content(prompt: str, *, temperature: float = 0.1) -> str:
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(temperature=temperature),
        )
        return str(response.text or "").strip()
    except Exception as exc:
        if _is_quota_or_rate_error(exc):
            logger.warning("Gemini quota/rate limit reached: %s", exc)
        else:
            logger.exception("Gemini generate_content failed")
        return ""


def _safe_embed_contents(contents: list[str], *, task_type: str = "RETRIEVAL_DOCUMENT") -> np.ndarray | None:
    if not contents:
        return np.empty((0, index.d), dtype=np.float32)
    try:
        embed_resp = client.models.embed_content(
            model="gemini-embedding-001",
            contents=contents,
            config=types.EmbedContentConfig(
                task_type=task_type,
                output_dimensionality=index.d,
            ),
        )
        return np.asarray(
            [np.asarray(e.values, dtype=np.float32) for e in embed_resp.embeddings],
            dtype=np.float32,
        )
    except Exception as exc:
        if _is_quota_or_rate_error(exc):
            logger.warning("Gemini embedding quota/rate limit reached: %s", exc)
        else:
            logger.exception("Gemini embed_content failed")
        return None


def _fallback_summary(text: str, max_len: int = 500) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "")).strip()
    if not cleaned:
        return "No contract text is available, so a simple summary cannot be created yet."
    sentence_split = re.split(r"(?<=[.!?])\s+", cleaned)
    summary = " ".join(sentence_split[:3]).strip() or cleaned[:max_len].strip()
    return summary[:max_len]


def _heuristic_clause_items(text: str, max_items: int = 8) -> list[dict]:
    lines = [ln.strip() for ln in re.split(r"[\n\r]+", text or "") if ln.strip()]
    long_lines = [ln for ln in lines if len(ln.split()) >= 8]
    chunks = long_lines[:max_items]
    if not chunks:
        paragraph_split = [p.strip() for p in re.split(r"(?<=[.!?])\s+", text or "") if p.strip()]
        chunks = paragraph_split[:max_items]

    patterns = [
        ("Termination", ["terminate", "termination", "breach", "notice"]),
        ("Payment", ["payment", "invoice", "fee", "penalty", "late"]),
        ("Confidentiality", ["confidential", "nda", "disclosure"]),
        ("Liability", ["liability", "damages", "indemn", "warranty"]),
        ("Data Protection", ["data", "privacy", "gdpr", "security"]),
        ("IP Ownership", ["intellectual property", "ip", "ownership", "license"]),
    ]
    high_terms = {"unlimited", "sole discretion", "immediately", "without notice", "indemnify"}
    medium_terms = {"penalty", "late fee", "automatic renewal", "exclusive", "liability"}

    results: list[dict] = []
    for idx, chunk in enumerate(chunks):
        lower = chunk.lower()
        ctype = "General"
        for label, keys in patterns:
            if any(k in lower for k in keys):
                ctype = label
                break
        if any(t in lower for t in high_terms):
            risk = "high"
        elif any(t in lower for t in medium_terms):
            risk = "medium"
        else:
            risk = "low"
        results.append(
            {
                "id": f"clause-{idx + 1}",
                "type": ctype,
                "risk_level": risk,
                "text": chunk[:500],
            }
        )
    return results


def _fallback_analysis_payload(text: str, existing_summary: str = "") -> dict:
    lower = (text or "").lower()
    high_markers = sum(lower.count(k) for k in ["unlimited liability", "indemnify", "without notice", "immediate termination"])
    medium_markers = sum(lower.count(k) for k in ["penalty", "late fee", "automatic renewal", "exclusive", "governing law"])
    risk_score = max(5, min(95, 20 + high_markers * 18 + medium_markers * 7))
    risk_level = "high" if risk_score >= 70 else "medium" if risk_score >= 40 else "low"
    summary = existing_summary.strip() or _fallback_summary(text)
    clauses = _heuristic_clause_items(text)
    return _normalize_analysis_payload(
        {
            "risk_score": risk_score,
            "risk_level": risk_level,
            "summary": summary,
            "clauses": clauses,
        }
    )


def _fallback_risk_classification(text: str) -> str:
    analysis = _fallback_analysis_payload(text)
    lines = []
    for clause in analysis.get("clauses", [])[:8]:
        if not isinstance(clause, dict):
            continue
        clause_type = str(clause.get("type") or "General")
        clause_risk = str(clause.get("risk_level") or "low").title()
        caution = (
            "This part may create a bigger burden or weaker protection."
            if clause_risk == "High"
            else "This part should be checked carefully because it may cause problems later."
            if clause_risk == "Medium"
            else "This part looks safer, but it should still be read carefully."
        )
        lines.append(f"- {clause_type}: {clause_risk} risk. {caution}")
    return "\n".join(lines) if lines else "- General: Low risk. No major warning signs were found in the available text."


def _fallback_improvements(text: str) -> str:
    base = [
        "- State clearly when either side can end the contract and how much notice must be given.",
        "- Put a clear limit on liability so one side is not exposed to unlimited losses.",
        "- Explain payment amounts, due dates, and what happens if there is a delay or dispute.",
        "- Say exactly what information must stay private and how long that duty continues.",
        "- Add clear rules for which law applies and how disputes will be handled.",
    ]
    if not (text or "").strip():
        return "\n".join(base[:3])
    return "\n".join(base)


def _clean_contract_snippet(text: str, max_len: int = 260) -> str:
    cleaned = (text or "").replace("\r", " ").replace("\n", " ")
    cleaned = (
        cleaned.replace("ﬁ", "fi")
        .replace("ﬂ", "fl")
        .replace("’", "'")
        .replace("“", '"')
        .replace("”", '"')
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:max_len]


def _fallback_clause_explanation(clause_text: str, clause_type: str, risk_level: str) -> dict:
    clause_label = (clause_type or "contract").strip() or "contract"
    level = str(risk_level or "medium").strip().lower()
    snippet = _clean_contract_snippet(clause_text, max_len=180)

    type_templates = {
        "termination": "This clause explains when the agreement can end and what each side must do before ending it.",
        "payment": "This clause explains when money must be paid, how much is due, and what may happen if payment is late.",
        "confidentiality": "This clause explains what information must stay private and when it can or cannot be shared.",
        "liability": "This clause explains who may be responsible if something goes wrong and how much they may have to cover.",
        "data protection": "This clause explains how personal or sensitive data must be handled and protected.",
        "ip ownership": "This clause explains who owns the work, ideas, or materials covered by the agreement.",
        "general": "This clause sets an important rule in the agreement that both sides should understand clearly.",
    }

    simple = type_templates.get(clause_label.lower(), f"This {clause_label.lower()} clause sets an important rule in the agreement that both sides should understand clearly.")
    if snippet:
        simple = f"{simple} It appears to cover this point: \"{snippet}\"."

    risk_reason = (
        "This clause may place a heavy burden on one side or leave that side with weak protection."
        if level == "high"
        else "This clause should be checked carefully because unclear wording could cause disagreement or extra obligations later."
        if level == "medium"
        else "This clause looks lower risk, but the wording should still be clear so both sides understand it the same way."
    )

    return {
        "simple_explanation": simple,
        "example": f"For example, this {clause_label.lower()} clause should clearly say who must do what, when they must do it, and what happens if they do not.",
        "risk_reason": risk_reason,
        "suggestions": [
            "Use clear, simple wording so each side understands its duties.",
            "Make sure dates, responsibilities, and limits are written clearly.",
            "Review the final wording carefully before signing.",
        ],
        "complexity_level": "High" if level == "high" else "Medium" if level == "medium" else "Low",
    }


def classify_risk(text: str) -> str:
    prompt = f"""
    You are a legal AI assistant helping a non-lawyer understand a contract.
    Analyze the following contract and list the main clauses in bullet points.
    For each bullet:
    1. Name the clause in simple words
    2. Assign a risk level (Low, Medium, High)
    3. Add one short plain-English sentence that says why it matters or what to watch out for

    Keep the wording simple, direct, and easy for a student to understand.
    Do not mention software, code, APIs, files, or system details.

    Contract Text:
    {text}
    """
    response_text = _safe_generate_content(prompt, temperature=0.1)
    return response_text or _fallback_risk_classification(text)


def suggest_improvements(text: str) -> str:
    prompt = f"""
    You are a legal AI assistant helping a non-lawyer understand a contract.
    Analyze the following contract and suggest improvements that reduce risk.

    For each bullet point:
    - explain the improvement in plain, easy English
    - make clear what problem it solves
    - keep it short and practical

    Focus only on the contract terms, obligations, risks, and protections.
    Do not mention software, code, APIs, files, or system details.

    Contract Text:
    {text}
    """
    response_text = _safe_generate_content(prompt, temperature=0.1)
    return response_text or _fallback_improvements(text)


def _extract_json_object(raw: str) -> dict:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        pass

    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        return {}
    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _normalize_analysis_payload(payload: dict) -> dict:
    risk_score_raw = payload.get("risk_score", 0)
    try:
        risk_score = int(float(risk_score_raw))
    except Exception:
        risk_score = 0
    risk_score = max(0, min(100, risk_score))

    risk_level = str(payload.get("risk_level", "low")).strip().lower()
    if risk_level not in {"low", "medium", "high"}:
        risk_level = "high" if risk_score >= 70 else "medium" if risk_score >= 40 else "low"

    summary = str(payload.get("summary") or payload.get("layman_summary") or "").strip()

    clauses = []
    raw_clauses = payload.get("clauses")
    if isinstance(raw_clauses, list):
        for idx, item in enumerate(raw_clauses):
            if not isinstance(item, dict):
                continue
            clause_type = str(item.get("type") or "General").strip() or "General"
            clause_risk = str(item.get("risk_level") or "low").strip().lower()
            if clause_risk not in {"low", "medium", "high"}:
                clause_risk = "low"
            clause_text = str(item.get("text") or "").strip()
            if not clause_text:
                continue
            clauses.append(
                {
                    "id": str(item.get("id") or f"clause-{idx + 1}"),
                    "type": clause_type,
                    "risk_level": clause_risk,
                    "text": clause_text,
                }
            )

    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "summary": summary,
        "layman_summary": summary,
        "clauses": clauses,
        "answer": summary,
        "chunks": [],
    }


def _analysis_storage_payload(payload: dict) -> dict:
    normalized = _normalize_analysis_payload(payload if isinstance(payload, dict) else {})
    stored = {
        "risk_score": normalized["risk_score"],
        "risk_level": normalized["risk_level"],
        "summary": normalized["summary"],
        "clauses": normalized["clauses"],
    }
    if isinstance(payload, dict):
        text_hash = str(payload.get("text_hash") or "").strip()
        if text_hash:
            stored["text_hash"] = text_hash
    return stored


def _contract_text_hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def _has_meaningful_analysis(payload: dict | None) -> bool:
    if not isinstance(payload, dict):
        return False
    summary = str(payload.get("summary") or "").strip()
    clauses = payload.get("clauses")
    risk_score = payload.get("risk_score")
    return (
        bool(summary)
        or (isinstance(clauses, list) and len(clauses) > 0)
        or isinstance(risk_score, (int, float))
    )


def _resolve_utf8_font_name() -> str:
    """
    Registers a UTF-8 capable TrueType font if found.
    This prevents garbled/alien text caused by raw PDF stream encoding.
    """
    candidates = [
        Path("backend/fonts/DejaVuSans.ttf"),
        Path("fonts/DejaVuSans.ttf"),
        Path("DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    ]

    for font_path in candidates:
        if font_path.exists():
            font_name = "ContractReportFont"
            try:
                pdfmetrics.registerFont(TTFont(font_name, str(font_path)))
                return font_name
            except Exception:
                continue

    # Fallback still readable for standard ASCII/Latin text.
    return "Helvetica"


def _generate_simple_report_pdf(title: str, lines: list[str]) -> bytes:
    """
    Replaces raw PDF stream generation with ReportLab-based generation.
    Output is readable in standard PDF viewers and properly encoded.
    """
    buffer = BytesIO()
    font_name = _resolve_utf8_font_name()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title="Contract Analysis Report",
        author="Contract AI",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontName=font_name,
        fontSize=16,
        leading=20,
        textColor=colors.HexColor("#1f2937"),
        spaceAfter=8,
    )
    body_style = ParagraphStyle(
        "ReportBody",
        parent=styles["BodyText"],
        fontName=font_name,
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor("#111827"),
        spaceAfter=3,
    )
    section_style = ParagraphStyle(
        "ReportSection",
        parent=styles["Heading3"],
        fontName=font_name,
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#111827"),
        spaceBefore=8,
        spaceAfter=4,
    )

    story = []
    story.append(Paragraph(title, title_style))
    story.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor("#d1d5db")))
    story.append(Spacer(1, 6))

    for raw in lines:
        text = (raw or "").strip()
        if not text:
            story.append(Spacer(1, 5))
            continue

        if text.endswith(":") and len(text) <= 40:
            story.append(Paragraph(text, section_style))
        else:
            safe_text = (
                text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\n", "<br/>")
            )
            story.append(Paragraph(safe_text, body_style))

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


Base.metadata.create_all(bind=engine)


def _ensure_contract_owner_column() -> None:
    """
    Minimal in-app migration to keep existing DBs working.

    The project uses `create_all()` which won't add new columns to an existing table,
    so we ensure `contracts.owner_id` exists for user-level data isolation.
    """

    inspector = inspect(engine)
    schema_attempts = (None, "public")

    columns: set[str] = set()
    schema_used: str | None = None
    for schema in schema_attempts:
        try:
            cols = inspector.get_columns("contracts", schema=schema)
            columns = {c.get("name") for c in cols if c.get("name")}
            schema_used = schema
            break
        except Exception:
            continue

    if not columns or "owner_id" in columns:
        return

    alter_targets = ["contracts"] if not schema_used else [f"{schema_used}.contracts", "contracts"]
    with engine.begin() as conn:
        for target in alter_targets:
            try:
                conn.execute(text(f"ALTER TABLE {target} ADD COLUMN owner_id VARCHAR"))
                break
            except Exception:
                continue
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_contracts_owner_id ON contracts (owner_id)"))
        except Exception:
            pass


_ensure_contract_owner_column()

UPLOAD_FOLDER = "uploads"

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/")
def root():
    return {"message": "Backend is running successfully"}

def generate_contract_summary(text: str) -> str:
    prompt = f"""
    You are a legal assistant helping a non-lawyer understand a contract.
    Summarize the following contract in simple, plain English.

    Make the summary easy for a student to understand.
    Explain:
    - what the contract is mainly about
    - the most important duties or promises
    - what the reader should be careful about

    Keep the legal meaning accurate, but avoid legal jargon when possible.
    Do not mention software, code, APIs, files, or system details.

    {text}
    """
    response_text = _safe_generate_content(prompt, temperature=0.1)
    return response_text or _fallback_summary(text)
def chunk_text(text, chunk_size=500):
    """
    Splits text into chunks of ~chunk_size words each.
    
    Args:
        text (str): Full contract text
        chunk_size (int): Number of words per chunk

    Returns:
        List[str]: List of text chunks
    """
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)
    return chunks

from auth_utils import get_current_user

@app.post("/upload")
@app.post("/contracts")
def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db),current_user: User = Depends(get_current_user)):

    # Generate unique ID manually
    contract_id = str(os.urandom(16).hex())

    # Save file to uploads folder
    file_location = f"{UPLOAD_FOLDER}/{contract_id}_{file.filename}"

    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Extract text from PDF
    reader = PdfReader(file_location)
    
    extracted_text = "..."  # already from PdfReader
    for page in reader.pages:
        extracted_text += page.extract_text() or ""

    chunks = chunk_text(extracted_text, chunk_size=400)  # smaller size for better retrieval
    print(f"Total chunks created: {len(chunks)}")
    
     # 5️⃣ Generate embeddings using current Gemini SDK
    embeddings_np = _safe_embed_contents(chunks, task_type="RETRIEVAL_DOCUMENT")
    if embeddings_np is not None and len(embeddings_np) > 0:
        vector_to_metadata.extend(
            {"contract_id": contract_id, "owner_id": current_user.id, "chunk_text": chunk}
            for chunk in chunks
        )
        index.add(embeddings_np)
        print("Number of chunks added:", len(chunks))
        print("Number of embeddings:", len(embeddings_np))
        print("FAISS index size now:", index.ntotal)
    else:
        logger.warning("Skipping embeddings for contract_id=%s due to embed failure", contract_id)

    
    # If text is large, trim or chunk (Gemini free tier safe)
    trimmed_text = extracted_text[:6000]  # adjust if needed

    # Generate AI summary using Gemini
    ai_summary = generate_contract_summary(trimmed_text)

    # 6️⃣ Generate Risk Classification & Suggested Improvements (Phase 3.2)
    ai_risk_analysis = classify_risk(trimmed_text)
    ai_suggested_improvements = suggest_improvements(trimmed_text)

    # Save record in database
    new_contract = Contract(
    id=contract_id,
    owner_id=current_user.id,
    filename=file.filename,
    file_path=file_location,
    summary=ai_summary,
    text=extracted_text,
    risk_classification=ai_risk_analysis,
    suggested_improvements=ai_suggested_improvements
    )

    db.add(new_contract)
    db.commit()
    
    return {
        "message": "File uploaded successfully",
        "contract_id": contract_id,
        "filename": file.filename,
        "summary": ai_summary,
        "risk_classification": ai_risk_analysis
    }

from pydantic import BaseModel

# Request model for /query
class QueryRequest(BaseModel):
    query: str
    top_k: int = 3  # number of relevant chunks to return


class QueryV2Request(BaseModel):
    contract_id: str
    query: str
    top_k: int = 3
    conversation_id: str | None = None
    stream: bool = False


class ChatMessageCreateRequest(BaseModel):
    role: str
    content: str
from auth_utils import get_current_user


def _search_relevant_chunks(
    user_query: str,
    top_k: int,
    *,
    owner_id: str | None = None,
    contract_id: str | None = None,
):
    embedding = _safe_embed_contents([user_query], task_type="RETRIEVAL_DOCUMENT")
    if embedding is None or len(embedding) == 0:
        return []
    query_vector = np.array(embedding[0], dtype=np.float32).reshape(1, -1)
    distances, indices = index.search(query_vector, max(top_k * 4, top_k))

    results = []
    for rank, idx in enumerate(indices[0]):
        idx = int(idx)
        if idx < 0 or idx >= len(vector_to_metadata):
            continue

        metadata = vector_to_metadata[idx]
        if owner_id and metadata.get("owner_id") != owner_id:
            continue
        if contract_id and metadata.get("contract_id") != contract_id:
            continue

        results.append(
            {
                "contract_id": metadata.get("contract_id"),
                "chunk_text": metadata.get("chunk_text"),
                "score": float(distances[0][rank]),
            }
        )
        if len(results) >= top_k:
            break
    return results


def _simple_search_chunks(text: str, user_query: str, contract_id: str | None, top_k: int) -> list[dict]:
    cleaned = (text or "").strip()
    if not cleaned:
        return []

    # Split into paragraphs/sentences for lightweight fallback retrieval.
    candidates = [p.strip() for p in re.split(r"(?<=[.!?])\s+|\n{2,}", cleaned) if p.strip()]
    if not candidates:
        return []

    terms = [t for t in re.findall(r"[a-zA-Z0-9']+", (user_query or "").lower()) if len(t) > 2]
    if not terms:
        terms = [t for t in re.findall(r"[a-zA-Z0-9']+", cleaned.lower())[:5] if t]

    scored: list[tuple[int, str]] = []
    for chunk in candidates:
        lower = chunk.lower()
        score = sum(lower.count(t) for t in terms)
        if score > 0:
            scored.append((score, chunk))

    if not scored:
        # Fallback to first few chunks if no term matches.
        scored = [(1, c) for c in candidates[:top_k]]

    scored.sort(key=lambda x: x[0], reverse=True)
    results: list[dict] = []
    for idx, (_, chunk) in enumerate(scored[:top_k]):
        results.append(
            {
                "contract_id": contract_id,
                "chunk_text": chunk[:1200],
                "score": float(top_k - idx),
            }
        )
    return results


def _load_recent_chat_history(
    db: Session,
    contract_id: str,
    user_id: str,
    *,
    limit: int = 5,
) -> list[ChatMessage]:
    recent = (
        db.query(ChatMessage)
        .filter(ChatMessage.contract_id == contract_id, ChatMessage.user_id == user_id)
        .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
        .limit(limit)
        .all()
    )
    return list(reversed(recent))


def _format_chat_history_lines(history: list[ChatMessage] | list[dict] | None) -> list[str]:
    lines: list[str] = []
    for turn in history or []:
        role = ""
        content = ""
        if isinstance(turn, ChatMessage):
            role = str(turn.role or "").strip().lower()
            content = str(turn.content or "").strip()
        elif isinstance(turn, dict):
            role = str(turn.get("role") or "").strip().lower()
            content = str(turn.get("content") or "").strip()

        if not content:
            continue
        speaker = "Assistant" if role == "assistant" else "User"
        lines.append(f"{speaker}: {content}")
    return lines


def _serialize_chat_message(message: ChatMessage) -> dict:
    return {
        "id": message.id,
        "contract_id": message.contract_id,
        "user_id": message.user_id,
        "role": message.role,
        "content": message.content,
        "created_at": message.created_at.isoformat() if message.created_at else None,
    }


def _build_ai_answer(user_query: str, results: list[dict], memory_lines: list[str] | None = None):
    top_chunks_text = "\n\n".join([r.get("chunk_text", "") for r in results])
    memory_block = "\n".join(memory_lines or []) or "None."
    prompt = f"""
    You are a contract analysis assistant. Answer questions based only on the contract text provided. If the answer is not in the contract, say clearly: I could not find this in the contract. Always cite the relevant section or clause when answering. Never invent obligations, dates, or terms not present in the contract. Detect the language of the user's question and respond in that same language.

    Previous conversation:
    {memory_block}

    Contract excerpts:
    {top_chunks_text}

    User question:
    "{user_query}"
    """

    response_text = _safe_generate_content(prompt, temperature=0.1)
    if response_text:
        return response_text
    if results:
        # Graceful degradation: surface a concise summary of the retrieved context so the user still gets value.
        fallback_summary = _fallback_summary(top_chunks_text, max_len=320)
        return (
            "I could not reach the AI service right now. Based on the retrieved contract excerpts: "
            f"{fallback_summary} Let me know which clause or risk you want to dig into."
        )
    return "I could not find enough indexed context for this question right now. Please retry after analysis or ask a narrower question."

def _smalltalk_response(user_query: str) -> str | None:
    q = (user_query or "").strip().lower()
    if not q:
        return None

    def is_match(phrases: set[str]) -> bool:
        return q in phrases

    greetings = {"hi", "hello", "hey", "hiya", "yo", "sup"}
    checkins = {
        "how are you",
        "how are you?",
        "how's it going",
        "how's it going?",
        "hows it going",
        "hows it going?",
        "what's up",
        "what's up?",
        "whats up",
        "whats up?",
    }
    gratitude = {"thanks", "thank you", "thx"}
    acknowledgements = {"ok", "okay", "cool", "got it", "great"}
    casual = {"wow", "nice", "awesome"}

    if is_match(greetings) or q.startswith("hi ") or q.startswith("hello ") or q.startswith("hey "):
        return "Hey! How can I help with your contract today?"
    if is_match(checkins):
        return "I’m doing great, thanks! Want to look at a clause or risk summary?"
    if is_match(gratitude):
        return "You’re welcome! Happy to help. Anything else you want to review?"
    if is_match(acknowledgements):
        return "Perfect. What should we check next in the contract?"
    if is_match(casual):
        return "Glad that helped! Want to go deeper into any clause?"

    return None


def _clarification_response(user_query: str) -> str | None:
    q = (user_query or "").strip()
    if not q:
        return "Could you share your question in a bit more detail?"

    low_info_terms = {"this", "that", "it", "explain", "help", "what", "why", "how"}
    if len(q) <= 3:
        return "Could you say a bit more about what you want explained?"
    if q.lower() in low_info_terms:
        return "I am not sure which clause you mean. Can you clarify the section or topic?"
    return None

@app.post("/query")
def query_contracts(request: QueryRequest, current_user: User = Depends(get_current_user)):
    user_query = request.query
    top_k = request.top_k
    smalltalk = _smalltalk_response(user_query)
    if smalltalk is not None:
        return {
            "query": user_query,
            "top_k": top_k,
            "results": [],
            "ai_answer": smalltalk
        }
    clarification = _clarification_response(user_query)
    if clarification is not None:
        return {
            "query": user_query,
            "top_k": top_k,
            "results": [],
            "ai_answer": clarification
        }
    results = _search_relevant_chunks(user_query, top_k, owner_id=current_user.id)
    ai_response = _build_ai_answer(user_query, results)

    return {
        "query": user_query,
        "top_k": top_k,
        "results": results,
        "ai_answer": ai_response
    }


@app.post("/query/v2")
def query_contracts_v2(
    request: QueryV2Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_query = request.query
    top_k = request.top_k
    contract_id = request.contract_id

    contract = (
        db.query(Contract)
        .filter(Contract.id == contract_id, Contract.owner_id == current_user.id)
        .first()
    )
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    smalltalk = _smalltalk_response(user_query)
    if smalltalk is not None:
        response = {
            "query": user_query,
            "top_k": top_k,
            "contract_id": contract_id,
            "results": [],
            "ai_answer": smalltalk,
            "streaming_enabled": ENABLE_CHAT_STREAMING and request.stream,
        }
        if ENABLE_CHAT_CITATIONS:
            response["citations"] = []
        return response
    clarification = _clarification_response(user_query)
    if clarification is not None:
        response = {
            "query": user_query,
            "top_k": top_k,
            "contract_id": contract_id,
            "results": [],
            "ai_answer": clarification,
            "streaming_enabled": ENABLE_CHAT_STREAMING and request.stream,
        }
        if ENABLE_CHAT_CITATIONS:
            response["citations"] = []
        return response

    results = _search_relevant_chunks(user_query, top_k, owner_id=current_user.id, contract_id=contract_id)
    if not results:
        results = _simple_search_chunks(
            contract.text if contract else "",
            user_query,
            contract_id,
            top_k,
        )

    recent_history = _load_recent_chat_history(db, contract_id, current_user.id, limit=5)
    memory_lines = _format_chat_history_lines(recent_history)

    ai_response = _build_ai_answer(
        user_query,
        results,
        memory_lines,
    )

    response = {
        "query": user_query,
        "top_k": top_k,
        "contract_id": contract_id,
        "results": results,
        "ai_answer": ai_response,
        "streaming_enabled": ENABLE_CHAT_STREAMING and request.stream,
    }

    if ENABLE_CHAT_CITATIONS:
        response["citations"] = [
            {
                "chunk_index": idx,
                "contract_id": item.get("contract_id"),
                "score": item.get("score"),
                "snippet": str(item.get("chunk_text", ""))[:220],
            }
            for idx, item in enumerate(results)
        ]

    return response


@app.get("/chat/{contract_id}/messages")
def get_chat_messages(
    contract_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contract = (
        db.query(Contract)
        .filter(Contract.id == contract_id, Contract.owner_id == current_user.id)
        .first()
    )
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.contract_id == contract_id, ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        .all()
    )
    return {"messages": [_serialize_chat_message(message) for message in messages]}


@app.post("/chat/{contract_id}/messages")
def create_chat_message(
    contract_id: str,
    payload: ChatMessageCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contract = (
        db.query(Contract)
        .filter(Contract.id == contract_id, Contract.owner_id == current_user.id)
        .first()
    )
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    role = str(payload.role or "").strip().lower()
    content = str(payload.content or "").strip()
    if role not in {"user", "assistant"}:
        raise HTTPException(status_code=400, detail="Invalid role")
    if not content:
        raise HTTPException(status_code=400, detail="Content is required")

    message = ChatMessage(
        contract_id=contract_id,
        user_id=current_user.id,
        role=role,
        content=content,
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    return _serialize_chat_message(message)


@app.get("/contracts")
def get_contracts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    contracts = db.query(Contract).filter(Contract.owner_id == current_user.id).all()
    
    return [
        {
            "id": c.id,
            "filename": c.filename,
            "uploaded_at": c.uploaded_at.isoformat() if c.uploaded_at else None,
            "summary": c.summary,
            "risk_classification": c.risk_classification,
            "suggested_improvements": c.suggested_improvements,
        } for c in contracts
    ]

# GET single contract by ID
@app.get("/contract/{contract_id}")
@app.get("/contracts/{contract_id}")
def get_contract(contract_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = db.query(Contract).filter(Contract.id == contract_id, Contract.owner_id == current_user.id).first()
    
    if not c:
        return {"error": "Contract not found"}
    stored_analysis = _analysis_storage_payload(c.analysis or {})
    return {
        "id": c.id,
        "filename": c.filename,
        "uploaded_at": c.uploaded_at.isoformat() if c.uploaded_at else None,
        "summary": c.summary,
        "risk_classification": c.risk_classification,
        "suggested_improvements": c.suggested_improvements,
        "analysis": stored_analysis,
    }


@app.post("/contracts/{contract_id}/analyze")
def analyze_contract(contract_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    contract = db.query(Contract).filter(Contract.id == contract_id, Contract.owner_id == current_user.id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    contract_text = (contract.text or "").strip()
    current_text_hash = _contract_text_hash(contract_text)
    stored_analysis = contract.analysis if isinstance(contract.analysis, dict) else {}

    if not contract_text:
        fallback_summary = str(contract.summary or "").strip()
        normalized = _normalize_analysis_payload(
            {
                "risk_score": 0,
                "risk_level": "low",
                "summary": fallback_summary,
                "clauses": [],
            }
        )
        contract.analysis = _analysis_storage_payload(normalized)
        db.commit()
        return {
            "risk_score": 0,
            "risk_level": "low",
            "summary": fallback_summary,
            "layman_summary": fallback_summary,
            "clauses": [],
            "answer": fallback_summary,
            "chunks": [],
        }

    stored_text_hash = str(stored_analysis.get("text_hash") or "").strip()
    if _has_meaningful_analysis(stored_analysis) and stored_text_hash == current_text_hash:
        return _normalize_analysis_payload(stored_analysis)

    prompt = f"""
You are a legal contract risk analyzer.
Return ONLY valid JSON. No markdown, no explanations, no extra text.

Schema:
{{
  "risk_score": <integer 0-100>,
  "risk_level": "low" | "medium" | "high",
  "summary": "<short plain-English summary>",
  "clauses": [
    {{
      "type": "<clause category>",
      "risk_level": "low" | "medium" | "high",
      "text": "<quoted clause text from the contract>"
    }}
  ]
}}

Rules:
- Be deterministic and conservative.
- Use the same scoring standard every time for the same text.
- Keep clause order aligned to the contract order.
- Return at most 8 clauses.
- Do not invent clauses that are not present in the contract.
- Write the summary in simple, plain English for a non-lawyer.
- The summary should briefly explain what the contract means, why it matters, and what to be careful about.
- Focus only on contract meaning, obligations, and risks.
- Do not mention software, code, APIs, files, or system details.

Contract text:
{contract_text[:12000]}
"""

    raw_text = _safe_generate_content(prompt, temperature=0.0)

    payload = _extract_json_object(raw_text)
    if payload:
        normalized = _normalize_analysis_payload(payload)
    else:
        normalized = _fallback_analysis_payload(contract_text, str(contract.summary or ""))

    if not normalized["summary"]:
        normalized["summary"] = str(contract.summary or "").strip()
        normalized["layman_summary"] = normalized["summary"]
        normalized["answer"] = normalized["summary"]

    normalized["text_hash"] = current_text_hash
    contract.analysis = _analysis_storage_payload(normalized)
    db.commit()

    return normalized


@app.get("/report/{contract_id}")
def download_contract_report(contract_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    contract = db.query(Contract).filter(Contract.id == contract_id, Contract.owner_id == current_user.id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    stored = _analysis_storage_payload(contract.analysis or {})
    clauses = stored.get("clauses") if isinstance(stored.get("clauses"), list) else []

    lines = [
        f"Filename: {contract.filename or ''}",
        f"Uploaded: {contract.uploaded_at.isoformat() if contract.uploaded_at else ''}",
        f"Risk Score: {stored.get('risk_score', 0)}",
        f"Risk Level: {stored.get('risk_level', 'low')}",
        "",
        "Summary:",
        str(stored.get("summary") or "No summary available"),
        "",
        "Top Clauses:",
    ]
    for clause in clauses[:8]:
        if not isinstance(clause, dict):
            continue
        c_type = str(clause.get("type") or "General")
        c_risk = str(clause.get("risk_level") or "low")
        c_text = str(clause.get("text") or "").replace("\n", " ").strip()
        lines.append(f"- [{c_risk}] {c_type}: {c_text[:180]}")

    pdf_bytes = _generate_simple_report_pdf("Contract Analysis Report", lines)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="contract-report-{contract_id}.pdf"'},
    )


@app.delete("/contracts/{contract_id}")
def delete_contract(contract_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    contract = db.query(Contract).filter(Contract.id == contract_id, Contract.owner_id == current_user.id).first()
    if not contract:
        return {"error": "Contract not found"}

    db.query(ChatMessage).filter(ChatMessage.contract_id == contract_id).delete(synchronize_session=False)
    db.delete(contract)
    db.commit()
    return {"message": "Contract deleted"}

@app.post("/explain-clause", response_model=ClauseExplainResponse)
async def explain_clause(data: ClauseExplainRequest):

    prompt = f"""
    You are a legal AI assistant helping a non-lawyer understand a contract clause.

    Analyze this contract clause:

    Clause Text:
    {data.clause_text}

    Clause Type:
    {data.clause_type}

    Risk Level:
    {data.risk_level}

    Respond strictly in JSON format with:
    {{
        "simple_explanation": "...",
        "example": "...",
        "risk_reason": "...",
        "suggestions": ["...", "..."],
        "complexity_level": "Low/Medium/High"
    }}

    Rules:
    - Use plain, easy English.
    - Explain what the clause means in everyday words.
    - Explain why it matters and what the reader should be careful about.
    - Keep the legal meaning accurate.
    - Focus only on the contract language.
    - Do not mention software, code, APIs, files, or system details.

    Do not include anything outside JSON.
    """

    raw_text = _safe_generate_content(prompt, temperature=0.1)
    parsed = _extract_json_object(raw_text)

    if not parsed:
        return _fallback_clause_explanation(data.clause_text, data.clause_type, data.risk_level)

    suggestions_raw = parsed.get("suggestions")
    suggestions = suggestions_raw if isinstance(suggestions_raw, list) else ["Review the wording carefully before signing."]
    suggestions = [str(item).strip() for item in suggestions if str(item).strip()] or ["Review the wording carefully before signing."]

    return {
        "simple_explanation": str(parsed.get("simple_explanation") or "").strip() or raw_text.strip() or "No simple explanation was provided.",
        "example": str(parsed.get("example") or "").strip() or "No example provided.",
        "risk_reason": str(parsed.get("risk_reason") or "").strip() or "No risk reason was provided.",
        "suggestions": suggestions,
        "complexity_level": str(parsed.get("complexity_level") or "Medium").strip() or "Medium",
    }

