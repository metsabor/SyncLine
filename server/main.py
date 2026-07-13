import os
import uuid
import random
import requests
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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
# НАСТРОЙКИ TELEGRAM
# ==========================================
TELEGRAM_BOT_TOKEN = "8616052823:AAGDSIvPZG33rqPJ_37nS2AraCaLh2Pc9vM"
ADMIN_CHAT_ID = "8560498548"  # твой chat_id для отладки

# ==========================================
# МОДЕЛИ ДАННЫХ (БЕЗ EMAIL)
# ==========================================
class UserRegister(BaseModel):
    username: str          # Telegram username (без @)
    password: str

class UserLogin(BaseModel):
    username: str          # Telegram username
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
    username: str
    code: str

class TelegramRegisterRequest(BaseModel):
    username: str          # Telegram username
    chat_id: str

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

def send_telegram_code(chat_id: str, code: str):
    """Отправляет код в Telegram"""
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    text = f"""🔐 **Код для входа в SyncLine: {code}**

*Не давайте этот код никому, даже если кто-то представляется сотрудником SyncLine.*

Этот код используется для входа в Ваш аккаунт. Он не может быть использован для чего-либо ещё.

Если Вы не запрашивали код для входа в аккаунт на другом устройстве, проигнорируйте это сообщение.

---

*С наилучшими пожеланиями,*  
**Команда SyncLine**"""
    
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            print(f"✅ Код {code} отправлен в Telegram (chat_id: {chat_id})")
            return True
        else:
            print(f"❌ Ошибка Telegram: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Ошибка отправки в Telegram: {e}")
        return False

def send_telegram_message(chat_id: str, text: str):
    """Отправляет обычное сообщение в Telegram"""
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
    try:
        response = requests.post(url, json=payload, timeout=5)
        if response.status_code == 200:
            print(f"✅ Сообщение отправлено в Telegram (chat_id: {chat_id})")
            return True
        else:
            print(f"❌ Ошибка Telegram: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Ошибка отправки: {e}")
        return False

# ==========================================
# ЭНДПОИНТЫ АВТОРИЗАЦИИ (БЕЗ EMAIL)
# ==========================================
@app.post("/api/auth/register")
async def register(user: UserRegister):
    try:
        # Проверяем, не занят ли username
        existing = supabase.table("users").select("id").eq("username", user.username).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail="Этот Telegram username уже используется")
        
        # Создаём пользователя в Supabase Auth (email теперь фиктивный, но обязательный)
        fake_email = f"{user.username}@syncline.local"
        response = supabase.auth.sign_up({
            "email": fake_email,
            "password": user.password,
        })
        if not response.user:
            raise HTTPException(status_code=400, detail="Ошибка регистрации")
        
        # Сохраняем в таблицу users
        supabase.table("users").insert({
            "id": response.user.id,
            "username": user.username,
            "created_at": datetime.utcnow().isoformat()
        }).execute()
        
        return {"success": True, "user_id": response.user.id, "message": "Регистрация успешна"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/auth/login")
async def login(user: UserLogin):
    try:
        # Ищем пользователя в таблице users по username
        profile = supabase.table("users").select("*").eq("username", user.username).execute()
        if not profile.data:
            raise HTTPException(status_code=401, detail="Пользователь не найден")
        
        # Авторизуемся через Supabase Auth (используем фиктивный email)
        fake_email = f"{user.username}@syncline.local"
        response = supabase.auth.sign_in_with_password({
            "email": fake_email,
            "password": user.password
        })
        if not response.user:
            raise HTTPException(status_code=401, detail="Неверный пароль")
        
        return {
            "success": True,
            "user": {
                "id": response.user.id,
                "username": user.username,
            },
            "session": response.session.access_token
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

@app.post("/api/auth/logout")
async def logout(user=Depends(get_current_user)):
    return {"success": True, "message": "Выход выполнен"}

# ==========================================
# ЭНДПОИНТЫ ДЛЯ КОДА ПОДТВЕРЖДЕНИЯ (ПО USERNAME)
# ==========================================
@app.post("/api/auth/request-code")
async def request_code(username: str):
    # Находим пользователя по username
    user = supabase.table("users").select("telegram_chat_id").eq("username", username).execute()
    if not user.data:
        raise HTTPException(status_code=404, detail="Пользователь не найден. Зарегистрируйтесь сначала.")
    
    chat_id = user.data[0].get("telegram_chat_id")
    if not chat_id:
        raise HTTPException(status_code=400, detail="Telegram не привязан. Напишите боту /start и /bind @username")
    
    code = "".join(str(random.randint(0, 9)) for _ in range(5))
    expires_at = datetime.utcnow() + timedelta(minutes=5)
    supabase.table("verification_codes").insert({
        "username": username,
        "code": code,
        "expires_at": expires_at.isoformat(),
        "used": False
    }).execute()
    
    success = send_telegram_code(chat_id, code)
    if not success:
        raise HTTPException(status_code=500, detail="Не удалось отправить код")
    
    return {"success": True, "message": "Код отправлен в Telegram"}

@app.post("/api/auth/verify-code")
async def verify_code(request: VerifyCodeRequest):
    username = request.username
    code = request.code
    result = supabase.table("verification_codes") \
        .select("*") \
        .eq("username", username) \
        .eq("code", code) \
        .execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Неверный код")
    supabase.table("verification_codes") \
        .delete() \
        .eq("username", username) \
        .execute()
    return {"success": True, "message": "Код подтверждён"}

# ==========================================
# ЭНДПОИНТ ДЛЯ ПРИВЯЗКИ TELEGRAM (через API)
# ==========================================
@app.post("/api/bot/register")
async def register_telegram_user(request: TelegramRegisterRequest):
    user = supabase.table("users").select("id").eq("username", request.username).execute()
    if not user.data:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    supabase.table("users").update({"telegram_chat_id": request.chat_id}).eq("id", user.data[0]["id"]).execute()
    return {"success": True, "message": "Telegram привязан"}

# ==========================================
# ЭНДПОИНТ ДЛЯ WEBHOOK TELEGRAM БОТА (ОБРАБОТКА КОМАНД)
# ==========================================
@app.post("/api/bot/webhook")
async def telegram_webhook(request: Request):
    """Обрабатывает команды от Telegram бота через Webhook"""
    try:
        data = await request.json()
    except Exception as e:
        print(f"❌ Ошибка парсинга JSON: {e}")
        return {"ok": False, "error": "Invalid JSON"}
    
    # Проверяем, что это сообщение
    if "message" not in data:
        return {"ok": True}
    
    message = data["message"]
    chat_id = str(message["chat"]["id"])
    text = message.get("text", "")
    
    print(f"📩 Получено сообщение от {chat_id}: {text}")
    
    # ==========================================
    # КОМАНДА /start
    # ==========================================
    if text == "/start":
        send_telegram_message(chat_id, 
            "👋 **Привет! Я бот SyncLine.**\n\n"
            "Чтобы привязать Telegram к аккаунту, отправьте команду:\n"
            "`/bind @ваш_username`\n\n"
            "Пример: `/bind @metsabor`\n\n"
            "После привязки вы будете получать коды для входа в SyncLine сюда.")
        return {"ok": True}
    
    # ==========================================
    # КОМАНДА /bind @username
    # ==========================================
    if text.startswith("/bind "):
        username = text.replace("/bind ", "").strip()
        if username.startswith("@"):
            username = username[1:]
        
        if not username:
            send_telegram_message(chat_id, "❌ Укажите username после /bind, например: `/bind @metsabor`")
            return {"ok": True}
        
        # Проверяем, существует ли пользователь с таким username
        user = supabase.table("users").select("id, telegram_chat_id").eq("username", username).execute()
        if not user.data:
            send_telegram_message(chat_id, 
                f"❌ Пользователь `@{username}` не найден в системе.\n\n"
                "Сначала зарегистрируйтесь в SyncLine с этим username.")
            return {"ok": True}
        
        # Обновляем chat_id
        supabase.table("users").update({"telegram_chat_id": chat_id}).eq("id", user.data[0]["id"]).execute()
        send_telegram_message(chat_id, 
            f"✅ **Аккаунт `@{username}` успешно привязан!**\n\n"
            "Теперь коды для входа в SyncLine будут приходить сюда.")
        return {"ok": True}
    
    # ==========================================
    # КОМАНДА /help
    # ==========================================
    if text == "/help":
        send_telegram_message(chat_id, 
            "📋 **Доступные команды:**\n\n"
            "`/start` — показать приветственное сообщение\n"
            "`/help` — показать список команд\n"
            "`/bind @username` — привязать Telegram к аккаунту SyncLine\n"
            "`/status` — проверить статус привязки\n\n"
            "После привязки вы будете получать коды для входа в SyncLine.")
        return {"ok": True}
    
    # ==========================================
    # КОМАНДА /status
    # ==========================================
    if text == "/status":
        # Ищем пользователя по chat_id
        user = supabase.table("users").select("username, telegram_chat_id").eq("telegram_chat_id", chat_id).execute()
        if user.data:
            send_telegram_message(chat_id, 
                f"✅ **Аккаунт привязан!**\n\n"
                f"Username: `@{user.data[0]['username']}`\n"
                f"Chat ID: `{chat_id}`")
        else:
            send_telegram_message(chat_id, 
                "❌ **Аккаунт не привязан.**\n\n"
                "Отправьте команду `/bind @ваш_username` для привязки.")
        return {"ok": True}
    
    # ==========================================
    # НЕИЗВЕСТНАЯ КОМАНДА
    # ==========================================
    send_telegram_message(chat_id, 
        "❓ Неизвестная команда.\n\n"
        "Доступные команды:\n"
        "`/start` — приветствие\n"
        "`/help` — список команд\n"
        "`/bind @username` — привязать Telegram\n"
        "`/status` — проверить статус привязки")
    
    return {"ok": True}

# ==========================================
# ЭНДПОИНТЫ ЧАТОВ
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

# ==========================================
# ЭНДПОИНТЫ СООБЩЕНИЙ
# ==========================================
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

# ==========================================
# ЭНДПОИНТЫ ДЛЯ СТАТУСА ПОЛЬЗОВАТЕЛЯ
# ==========================================
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