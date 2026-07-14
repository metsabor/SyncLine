import os
import uuid
import random
import requests
import jwt
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Depends, Header, Request, UploadFile, File
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
# НАСТРОЙКИ TELEGRAM
# ==========================================
TELEGRAM_BOT_TOKEN = "8616052823:AAGDSIvPZG33rqPJ_37nS2AraCaLh2Pc9vM"
ADMIN_CHAT_ID = "8560498548"

# ==========================================
# НАСТРОЙКИ LIVEKIT (ГОЛОС)
# ==========================================
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "https://livekit-xxxx.onrender.com")  # замени после деплоя
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "your-api-key")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "your-api-secret")

# ==========================================
# МОДЕЛИ ДАННЫХ
# ==========================================
class UserRegister(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class ChangePassword(BaseModel):
    old_password: str
    new_password: str

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
    username: str
    chat_id: str

# ==========================================
# МОДЕЛИ ДЛЯ КАНАЛОВ/ГРУПП
# ==========================================
class ChannelCreate(BaseModel):
    name: str
    username: Optional[str] = None
    type: str  # 'channel' или 'group'
    is_private: bool = False
    participants: List[str] = []

class ChannelMember(BaseModel):
    channel_id: str
    username: str

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
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    text = f"""🔐 **Код для входа в SyncLine: {code}**

*Не давайте этот код никому, даже если кто-то представляется сотрудником SyncLine.*

Этот код используется для входа в Ваш аккаунт. Он не может быть использован для чего-либо ещё.

Если Вы не запрашивали код для входа в аккаунт на другом устройстве, проигнорируйте это сообщение.

---
*С наилучшими пожеланиями,*  
**Команда SyncLine**"""
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
    try:
        response = requests.post(url, json=payload, timeout=10)
        return response.status_code == 200
    except:
        return False

def send_telegram_message(chat_id: str, text: str):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
    try:
        requests.post(url, json=payload, timeout=5)
        return True
    except:
        return False

# ==========================================
# ЭНДПОИНТЫ АВТОРИЗАЦИИ
# ==========================================
@app.post("/api/auth/register")
async def register(user: UserRegister):
    try:
        existing = supabase.table("users").select("id").eq("username", user.username).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail="Этот Telegram username уже используется")
        fake_email = f"{user.username}@syncline.local"
        response = supabase.auth.sign_up({"email": fake_email, "password": user.password})
        if not response.user:
            raise HTTPException(status_code=400, detail="Ошибка регистрации")
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
        profile = supabase.table("users").select("*").eq("username", user.username).execute()
        if not profile.data:
            raise HTTPException(status_code=401, detail="Пользователь не найден")
        fake_email = f"{user.username}@syncline.local"
        response = supabase.auth.sign_in_with_password({"email": fake_email, "password": user.password})
        if not response.user:
            raise HTTPException(status_code=401, detail="Неверный пароль")
        return {
            "success": True,
            "user": {"id": response.user.id, "username": user.username},
            "session": response.session.access_token
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

@app.post("/api/auth/logout")
async def logout(user=Depends(get_current_user)):
    return {"success": True, "message": "Выход выполнен"}

# ==========================================
# СМЕНА ПАРОЛЯ
# ==========================================
@app.post("/api/auth/change-password")
async def change_password(data: ChangePassword, user=Depends(get_current_user)):
    try:
        fake_email = f"{user.user_metadata.get('username', user.email)}@syncline.local"
        try:
            supabase.auth.sign_in_with_password({"email": fake_email, "password": data.old_password})
        except:
            raise HTTPException(status_code=400, detail="Неверный текущий пароль")
        supabase.auth.admin.update_user_by_id(user.id, {"password": data.new_password})
        return {"success": True, "message": "Пароль обновлён"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==========================================
# КОД ПОДТВЕРЖДЕНИЯ
# ==========================================
@app.post("/api/auth/request-code")
async def request_code(username: str):
    user = supabase.table("users").select("telegram_chat_id").eq("username", username).execute()
    if not user.data:
        raise HTTPException(status_code=404, detail="Пользователь не найден. Зарегистрируйтесь через бота /register")
    chat_id = user.data[0].get("telegram_chat_id")
    if not chat_id:
        raise HTTPException(status_code=400, detail="Telegram не привязан. Напишите боту /bind @username")
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
    result = supabase.table("verification_codes") \
        .select("*") \
        .eq("username", request.username) \
        .eq("code", request.code) \
        .execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Неверный код")
    supabase.table("verification_codes").delete().eq("username", request.username).execute()
    return {"success": True, "message": "Код подтверждён"}

# ==========================================
# TELEGRAM WEBHOOK (с /register и /bind)
# ==========================================
@app.post("/api/bot/webhook")
async def telegram_webhook(request: Request):
    try:
        data = await request.json()
    except:
        return {"ok": False}
    if "message" not in data:
        return {"ok": True}
    message = data["message"]
    chat_id = str(message["chat"]["id"])
    text = message.get("text", "")
    print(f"📩 Получено сообщение от {chat_id}: {text}")

    # /start
    if text == "/start":
        send_telegram_message(chat_id,
            "👋 **Привет! Я бот SyncLine.**\n\n"
            "Чтобы создать аккаунт, отправьте команду:\n"
            "`/register @ваш_username`\n\n"
            "Пример: `/register @metsabor`\n\n"
            "После регистрации откройте лаунчер и войдите с этим username.\n"
            "Код для входа придёт сюда.")
        return {"ok": True}

    # /help
    if text == "/help":
        send_telegram_message(chat_id,
            "📋 **Команды:**\n\n"
            "`/start` — приветствие\n"
            "`/help` — этот список\n"
            "`/register @username` — создать аккаунт\n"
            "`/bind @username` — привязать Telegram к существующему аккаунту\n"
            "`/status` — проверить статус")
        return {"ok": True}

    # /status
    if text == "/status":
        user = supabase.table("users").select("username, telegram_chat_id").eq("telegram_chat_id", chat_id).execute()
        if user.data:
            send_telegram_message(chat_id,
                f"✅ **Аккаунт привязан!**\n\n"
                f"Username: `@{user.data[0]['username']}`")
        else:
            send_telegram_message(chat_id,
                "❌ **Аккаунт не привязан.**\n\n"
                "Отправьте команду `/register @username` для регистрации\n"
                "или `/bind @username` для привязки.")
        return {"ok": True}

    # /register @username
    if text.startswith("/register "):
        username = text.replace("/register ", "").strip()
        if username.startswith("@"):
            username = username[1:]
        if not username:
            send_telegram_message(chat_id, "❌ Укажите username после /register, например: `/register @metsabor`")
            return {"ok": True}
        existing = supabase.table("users").select("id").eq("username", username).execute()
        if existing.data:
            send_telegram_message(chat_id, f"❌ Username `@{username}` уже занят. Попробуйте другой.")
            return {"ok": True}
        fake_email = f"{username}@syncline.local"
        temp_password = "".join(random.choices("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", k=12))
        try:
            response = supabase.auth.sign_up({"email": fake_email, "password": temp_password})
            if not response.user:
                send_telegram_message(chat_id, "❌ Ошибка регистрации. Попробуйте позже.")
                return {"ok": True}
            supabase.table("users").insert({
                "id": response.user.id,
                "username": username,
                "telegram_chat_id": chat_id,
                "created_at": datetime.utcnow().isoformat()
            }).execute()
            send_telegram_message(chat_id,
                f"✅ **Аккаунт `@{username}` создан!**\n\n"
                f"Теперь откройте SyncLine и войдите с этим username.\n"
                f"Код для входа придёт сюда.\n\n"
                f"Временный пароль: `{temp_password}`\n"
                f"(Вы смените его при первом входе в настройках).")
        except Exception as e:
            send_telegram_message(chat_id, f"❌ Ошибка: {str(e)}")
        return {"ok": True}

    # /bind @username
    if text.startswith("/bind "):
        username = text.replace("/bind ", "").strip()
        if username.startswith("@"):
            username = username[1:]
        if not username:
            send_telegram_message(chat_id, "❌ Укажите username после /bind, например: `/bind @metsabor`")
            return {"ok": True}
        user = supabase.table("users").select("id, telegram_chat_id").eq("username", username).execute()
        if not user.data:
            send_telegram_message(chat_id, f"❌ Пользователь `@{username}` не найден в системе.\n\nСначала зарегистрируйтесь через `/register @username`.")
            return {"ok": True}
        supabase.table("users").update({"telegram_chat_id": chat_id}).eq("id", user.data[0]["id"]).execute()
        send_telegram_message(chat_id, f"✅ Аккаунт `@{username}` привязан к этому Telegram!\nТеперь коды будут приходить сюда.")
        return {"ok": True}

    send_telegram_message(chat_id, "❓ Неизвестная команда. Введите /help для списка.")
    return {"ok": True}

# ==========================================
# ЭНДПОИНТЫ ДЛЯ КАНАЛОВ/ГРУПП
# ==========================================
@app.post("/api/channels")
async def create_channel(channel: ChannelCreate, user=Depends(get_current_user)):
    try:
        if channel.username:
            existing = supabase.table("channels").select("id").eq("username", channel.username).execute()
            if existing.data:
                raise HTTPException(status_code=400, detail="Username already taken")
        new_channel = supabase.table("channels").insert({
            "name": channel.name,
            "username": channel.username or channel.name,
            "type": channel.type,
            "is_private": channel.is_private,
            "created_by": user.id,
            "created_at": datetime.utcnow().isoformat()
        }).execute()
        channel_id = new_channel.data[0]["id"]
        supabase.table("channel_members").insert({
            "channel_id": channel_id,
            "user_id": user.id,
            "role": "admin"
        }).execute()
        for username in channel.participants:
            user_data = supabase.table("users").select("id").eq("username", username).execute()
            if user_data.data:
                supabase.table("channel_members").insert({
                    "channel_id": channel_id,
                    "user_id": user_data.data[0]["id"],
                    "role": "member"
                }).execute()
        return {"success": True, "channel_id": channel_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/channels")
async def get_channels(user=Depends(get_current_user)):
    try:
        channels = supabase.table("channels").select("*").execute()
        return {"channels": channels.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/channels/{channel_id}/members")
async def get_channel_members(channel_id: str, user=Depends(get_current_user)):
    try:
        members = supabase.table("channel_members") \
            .select("user_id, role, users!inner(username)") \
            .eq("channel_id", channel_id) \
            .execute()
        return {"members": members.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/channels/{channel_id}/join")
async def join_channel(channel_id: str, user=Depends(get_current_user)):
    try:
        existing = supabase.table("channel_members") \
            .select("id") \
            .eq("channel_id", channel_id) \
            .eq("user_id", user.id) \
            .execute()
        if existing.data:
            raise HTTPException(status_code=400, detail="Already a member")
        supabase.table("channel_members").insert({
            "channel_id": channel_id,
            "user_id": user.id,
            "role": "member"
        }).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# ЭНДПОИНТЫ ДЛЯ СООБЩЕНИЙ (ЧАТЫ)
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
# ЭНДПОИНТЫ ДЛЯ ГОЛОСОВЫХ ТОКЕНОВ (LIVEKIT)
# ==========================================
@app.post("/api/voice/token")
async def get_voice_token(room: str, user=Depends(get_current_user)):
    try:
        profile = supabase.table("users").select("username").eq("id", user.id).execute()
        username = profile.data[0]["username"] if profile.data else user.id
        token = jwt.encode({
            "exp": datetime.utcnow() + timedelta(hours=24),
            "iss": LIVEKIT_API_KEY,
            "nbf": datetime.utcnow(),
            "sub": user.id,
            "video": {
                "room": room,
                "identity": username,
                "roomJoin": True,
                "canPublish": True,
                "canSubscribe": True,
            },
        }, LIVEKIT_API_SECRET, algorithm="HS256")
        return {"token": token, "url": LIVEKIT_URL}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# ЗАПУСК
# ==========================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)