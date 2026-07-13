from supabase import create_client
import os
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

print(f"URL: {url}")
print(f"Key: {key}")

try:
    client = create_client(url, key)
    print("✅ Клиент создан успешно!")
except Exception as e:
    print(f"❌ Ошибка: {e}")