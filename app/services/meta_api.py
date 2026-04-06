import os
import json
import base64
import time
import httpx
from google.oauth2 import service_account
from googleapiclient.discovery import build
import logging
from app.config import settings
from typing import Dict, Any

meta_cache: Dict[str, Any] = {"data": None, "timestamp": 0}

def get_google_creds():
    try:
        creds_b64 = os.environ.get("GOOGLE_CREDS_BASE64")
        if creds_b64:
            info = json.loads(base64.b64decode(creds_b64).decode('utf-8'))
        else:
            info = {
                "type": "service_account",
                "project_id": os.environ.get("GOOGLE_PROJECT_ID"),
                "private_key": os.environ.get("GOOGLE_PRIVATE_KEY", "").replace('\\n', '\n'),
                "client_email": os.environ.get("GOOGLE_CLIENT_EMAIL"),
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        return service_account.Credentials.from_service_account_info(info, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])
    except Exception as e:
        logging.error(f"Creds Error: {e}")
        return None

async def get_meta_data_cached(client: httpx.AsyncClient):
    """
    Obtiene la metadata de Meta Cacheada (10s) extendiendo la API 
    para traer alertas (issues_info) y límite de puja (bid_amount).
    """
    curr_time = time.time()
    if meta_cache["data"] and (curr_time - meta_cache["timestamp"] < 10):
        return meta_cache["data"]
    
    url = f"https://graph.facebook.com/{settings.API_VERSION}/{settings.META_AD_ACCOUNT_ID}/adsets"
    # Se expanden los parámetros de la petición de Meta API 
    params = {
        "fields": "id,name,status,daily_budget,bid_amount,issues_info,insights.date_preset(today){spend,actions}", 
        "access_token": settings.META_ACCESS_TOKEN, 
        "limit": "500"
    }
    
    try:
        res = await client.get(url, params=params)
        data = res.json().get("data", [])
        meta_cache["data"] = data
        meta_cache["timestamp"] = curr_time
        return data
    except Exception as e:
        logging.error(f"Cache Error: {e}")
        return meta_cache["data"] or []

def clear_meta_cache():
    meta_cache["timestamp"] = 0
