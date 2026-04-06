from fastapi import APIRouter, HTTPException
from app.services.meta_api import get_google_creds
from app.config import settings
from googleapiclient.discovery import build

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.get("/auditors")
async def get_auditors():
    creds = get_google_creds()
    if not creds: 
        return {"auditors": ["Auditor Maestro"]}
    try:
        service = build('sheets', 'v4', credentials=creds)
        res = service.spreadsheets().values().get(spreadsheetId=settings.SHEET_ID, range="Auditores!A:B").execute()
        values = res.get('values', [])
        return {"auditors": [row[0] for row in values[1:] if row]}
    except Exception as e: 
        return {"auditors": ["Error al cargar"]}

@router.post("/login")
async def login(req: dict):
    creds = get_google_creds()
    if not creds: raise HTTPException(401, "Configuración incompleta")
    try:
        service = build('sheets', 'v4', credentials=creds)
        res = service.spreadsheets().values().get(spreadsheetId=settings.SHEET_ID, range="Auditores!A:B").execute()
        values = res.get('values', [])
        for row in values[1:]:
            if row[0] == req['nombre'] and str(row[1]) == str(req['password']):
                return {"user": row[0]}
        raise HTTPException(401, "Credenciales inválidas")
    except: 
        raise HTTPException(500, "Error de validación")
