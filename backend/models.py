import uuid

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import text as sql_text
from database import Base


class Contract(Base):
    __tablename__ = "contracts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id = Column(String, nullable=True, index=True)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    text = Column(Text)
    summary = Column(Text)
    risk_classification = Column(Text, nullable=True)
    suggested_improvements = Column(Text, nullable=True)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    analysis = Column(
        JSONB,
        nullable=False,
        server_default=sql_text("'{}'::jsonb")
    )


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    contract_id = Column(String, ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
