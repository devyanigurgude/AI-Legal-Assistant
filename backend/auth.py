from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import User
from auth_utils import get_password_hash, verify_password, create_access_token
from pydantic import BaseModel
import os

router = APIRouter(prefix="/auth", tags=["auth"])


class AuthRequest(BaseModel):
    username: str
    password: str


@router.post("/register")
def register(data: AuthRequest, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.username == data.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")

    user = User(
        id=str(os.urandom(16).hex()),
        username=data.username,
        password_hash=get_password_hash(data.password),
    )

    db.add(user)
    db.commit()

    return {"message": "User registered successfully"}


@router.post("/login")
def login(data: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(user.id)

    return {"access_token": token, "token_type": "bearer"}