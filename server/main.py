import os
import uuid
import random
import requests
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from supabase_client import supabase
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="SyncLine API", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# НАСТРОЙКИ TELEGRAM (ТВОИ ДАННЫЕ)
# ==========================================
TELEGRAM_BOT_TOKEN = "8616052823:AAGDSIvPZG33rqPJ_37nS2AraCaLh2Pc9vM"
TELEGRAM_CHAT_ID = "8560498548"  # <-- ТВОЙ CHAT_ID

# ==========================================
# МОДЕЛИ ДАННЫХ
# ==========================================
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    username: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class MessageCreate(BaseModel):
    chat_id: str
    text: str
    type: str = "text"
    file_url: Optional[str] = None
    is_one_time: bool = False
    reply_to: Optional[int] = None

class ChatCreate(BaseModel):
    name: str
    participants: List[str]

class VerifyCodeRequest(BaseModel):
    email: str
    code: str

# ==========================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ==========================================
def get_current_user(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Не авторизован")
    token = authorization.replace("Bearer ", "")
    try:
        user = supabase.auth.get_user(token)
        return user.user
    except Exception as e:
        raise HTTPException(status_code=401, detail="Невалидный токен")

def send_telegram_code(code: str):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    text = f"🔐 **Ваш код для входа в SyncLine:**\n\n`{code}`\n\n*Введите этот код в приложении.*"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": text,
        "parse_mode": "Markdown"
    }
    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            print(f"✅ Код {code} отправлен в Telegram")
            return True
        else:
            print(f"❌ Ошибка Telegram: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Ошибка отправки в Telegram: {e}")
        return False

# ==========================================
# ЭНДПОИНТЫ АВТОРИЗАЦИИ
# ==========================================
@app.post("/api/auth/register")
async def register(user: UserRegister):
    try:
        response = supabase.auth.sign_up({
            "email": user.email,
            "password": user.password,
        })
        if not response.user:
            raise HTTPException(status_code=400, detail="Ошибка регистрации")
        supabase.table("users").insert({
            "id": response.user.id,
            "username": user.username,
            "email": user.email,
            "created_at": datetime.utcnow().isoformat()
        }).execute()
        return {"success": True, "user_id": response.user.id, "message": "Регистрация успешна"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/auth/login")
async def login(user: UserLogin):
    try:
        response = supabase.auth.sign_in_with_password({
            "email": user.email,
            "password": user.password
        })
        if not response.user:
            raise HTTPException(status_code=401, detail="Неверные данные")
        profile = supabase.table("users").select("*").eq("id", response.user.id).execute()
        return {
            "success": True,
            "user": {
                "id": response.user.id,
                "email": response.user.email,
                "username": profile.data[0].get("username") if profile.data else user.email,
            },
            "session": response.session.access_token
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

@app.post("/api/auth/logout")
async def logout(user=Depends(get_current_user)):
    return {"success": True, "message": "Выход выполнен"}

# ==========================================
# ЭНДПОИНТЫ КОДА ПОДТВЕРЖДЕНИЯ
# ==========================================
@app.post("/api/auth/request-code")
async def request_code(email: str):
    code = "".join(str(random.randint(0, 9)) for _ in range(5))
    expires_at = datetime.utcnow() + timedelta(minutes=5)
    supabase.table("verification_codes").insert({
        "email": email,
        "code": code,
        "expires_at": expires_at.isoformat(),
        "used": False
    }).execute()
    
    success = send_telegram_code(code)
    if not success:
        raise HTTPException(status_code=500, detail="Не удалось отправить код")
    
    return {"success": True, "message": "Код отправлен в Telegram"}

@app.post("/api/auth/verify-code")
async def verify_code(request: VerifyCodeRequest):
    email = request.email
    code = request.code
    result = supabase.table("verification_codes") \
        .select("*") \
        .eq("email", email) \
        .eq("code", code) \
        .execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Неверный код")
    supabase.table("verification_codes") \
        .delete() \
        .eq("email", email) \
        .execute()
    return {"success": True, "message": "Код подтверждён"}

# ==========================================
# ОСТАЛЬНЫЕ ЭНДПОИНТЫ (чаты, сообщения)
# ==========================================
@app.get("/api/chats")
async def get_chats(user=Depends(get_current_user)):
    try:
        chats = supabase.table("chats").select("*").execute()
        return {"chats": chats.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chats")
async def create_chat(chat: ChatCreate, user=Depends(get_current_user)):
    try:
        new_chat = supabase.table("chats").insert({
            "name": chat.name,
            "type": "private" if len(chat.participants) == 1 else "group",
            "created_at": datetime.utcnow().isoformat()
        }).execute()
        chat_id = new_chat.data[0]["id"]
        for username in chat.participants:
            user_data = supabase.table("users").select("id").eq("username", username).execute()
            if user_data.data:
                supabase.table("participants").insert({
                    "chat_id": chat_id,
                    "user_id": user_data.data[0]["id"]
                }).execute()
        supabase.table("participants").insert({
            "chat_id": chat_id,
            "user_id": user.id
        }).execute()
        return {"success": True, "chat_id": chat_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/messages/{chat_id}")
async def get_messages(chat_id: str, limit: int = 50, before: Optional[str] = None, user=Depends(get_current_user)):
    try:
        query = supabase.table("messages").select("*").eq("chat_id", chat_id).order("created_at", desc=False).limit(limit)
        if before:
            query = query.lt("created_at", before)
        messages = query.execute()
        return {"messages": messages.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/messages")
async def send_message(msg: MessageCreate, user=Depends(get_current_user)):
    try:
        new_msg = supabase.table("messages").insert({
            "chat_id": msg.chat_id,
            "sender_id": user.id,
            "text": msg.text,
            "type": msg.type,
            "file_url": msg.file_url,
            "is_one_time": msg.is_one_time,
            "reply_to": msg.reply_to,
            "created_at": datetime.utcnow().isoformat()
        }).execute()
        return {"success": True, "message": new_msg.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/messages/{message_id}")
async def delete_message(message_id: int, user=Depends(get_current_user)):
    try:
        msg = supabase.table("messages").select("*").eq("id", message_id).execute()
        if not msg.data:
            raise HTTPException(status_code=404, detail="Сообщение не найдено")
        if msg.data[0]["sender_id"] != user.id:
            raise HTTPException(status_code=403, detail="Нельзя удалить чужое сообщение")
        supabase.table("messages").update({"is_deleted": True}).eq("id", message_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/users/status")
async def update_status(status: str, user=Depends(get_current_user)):
    try:
        supabase.table("users").update({"status": status, "last_seen": datetime.utcnow().isoformat()}).eq("id", user.id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# ЗАПУСК
# ==========================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)