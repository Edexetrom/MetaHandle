import asyncio
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base, SessionLocal
from app.models import TurnConfig, AutomationState, AdSetSetting
from app.routers import ads, turns, auth, holidays
from app.services.automation import automation_engine

# Creamos las tablas
Base.metadata.create_all(bind=engine)

app = FastAPI(title="MetaHandle API", version="2.5.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(ads.router)
app.include_router(turns.router)
app.include_router(auth.router)
app.include_router(holidays.router)

ALLOWED_IDS = [
    "120238886501840717", "120238886472900717", "120238886429400717", "120238886420220717", 
    "120238886413960717", "120238886369210717", "120234721717970717", "120234721717960717", 
    "120234721717950717", "120233618279570717", "120233618279540717", "120233611687810717", 
    "120232204774610717", "120232204774590717", "120232204774570717", "120232157515490717", 
    "120232157515480717", "120232157515460717"
]

@app.on_event("startup")
async def startup_event():
    app.state.client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=60.0))
    db = SessionLocal()
    
    if not db.query(AutomationState).first():
        db.add(AutomationState(id=1, is_active=False))
        
    existing_turns = {t.name: t for t in db.query(TurnConfig).all()}
    defaults = {
        "matutino normal": {"start_hour": 6.5, "end_hour": 13.0, "days": "M,X,J,V"},
        "matutino especial": {"start_hour": 5.5, "end_hour": 13.0, "days": "L"},
        "vespertino": {"start_hour": 11.0, "end_hour": 19.0, "days": "L,M,X,J,V"},
        "nocturno": {"start_hour": 15.0, "end_hour": 22.0, "days": "L,M,X,J,V"},
        "fsemana": {"start_hour": 7.0, "end_hour": 17.0, "days": "S"}
    }
    
    if not existing_turns:
        db.add_all([TurnConfig(name=k, **v) for k, v in defaults.items()])
    else:
        for k, v in defaults.items():
            if k not in existing_turns:
                db.add(TurnConfig(name=k, **v))
                
    # Inserción inicial de IDs
    # Evaluamos si la DB de adsets ya está poblada, de otra forma asignamos los defaults.
    # Dado que las instrucciones dicen "asigne configuraciones por defecto si son nuevos":
    for ad_id in ALLOWED_IDS:
        adset = db.query(AdSetSetting).filter(AdSetSetting.id == ad_id).first()
        if not adset:
            if ad_id in ["120232204774590717", "120233611687810717"]:
                t = "vespertino"
                lim = 85.0
            elif ad_id == "120234721717960717":
                t = "vespertino,fsemana"
                lim = 85.0
            elif ad_id in ["120234721717970717", "120234721717950717", "120233618279570717", "120233618279540717", "120232204774570717", "120232204774610717"]:
                t = "matutino normal,matutino especial"
                lim = 60.0
            elif ad_id in ["120238886501840717", "120238886472900717", "120238886420220717", "120238886413960717", "120232157515490717", "120232157515460717"]:
                t = "nocturno"
                lim = 80.0
            else:
                t = ""
                lim = 0.0
            
            db.add(AdSetSetting(id=ad_id, turno=t, limit_perc=lim))
            
    db.commit()
    db.close()
    
    # Arrancamos automation engine
    asyncio.create_task(automation_engine(app.state.client))

@app.on_event("shutdown")
async def shutdown_event():
    await app.state.client.aclose()
