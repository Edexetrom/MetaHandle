from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AdSetSetting, TurnConfig, AutomationState, ActionLog
from app.services.meta_api import get_meta_data_cached, clear_meta_cache
from app.config import settings

router = APIRouter(prefix="/ads", tags=["Ads"])

@router.get("/sync")
async def sync_data(request: Request, db: Session = Depends(get_db)):
    meta = await get_meta_data_cached(request.app.state.client)
    settings_data = {s.id: {"limit_perc": s.limit_perc, "turno": s.turno, "is_frozen": s.is_frozen} for s in db.query(AdSetSetting).all()}
    turns = {t.name: {"start": t.start_hour, "end": t.end_hour, "days": t.days} for t in db.query(TurnConfig).all()}
    auto = db.query(AutomationState).first()
    logs = db.query(ActionLog).order_by(ActionLog.id.desc()).limit(15).all()
    
    return {
        "meta": meta, 
        "settings": settings_data, 
        "turns": turns,
        "automation_active": auto.is_active if auto else False,
        "logs": [{"user": l.user, "msg": l.msg, "time": l.time.strftime("%H:%M:%S")} for l in logs]
    }

@router.post("/meta-status")
async def update_meta_status(req: dict, request: Request, db: Session = Depends(get_db)):
    res = await request.app.state.client.post(
        f"https://graph.facebook.com/{settings.API_VERSION}/{req['id']}", 
        params={"status": req['status'], "access_token": settings.META_ACCESS_TOKEN}
    )
    if res.status_code == 200:
        db.add(ActionLog(user=req['user'], msg=f"Manual: {req['status']} en {req['id']}"))
        db.commit()
        clear_meta_cache()
        return {"ok": True}
    return {"ok": False}

@router.post("/update")
async def update_setting(req: dict, db: Session = Depends(get_db)):
    s = db.query(AdSetSetting).filter(AdSetSetting.id == req['id']).first()
    if not s: 
        s = AdSetSetting(id=req['id'])
        db.add(s)
    if 'limit_perc' in req: s.limit_perc = float(req['limit_perc'])
    if 'turno' in req: s.turno = req['turno']
    if 'is_frozen' in req: s.is_frozen = bool(req['is_frozen'])
    db.commit()
    return {"ok": True}

@router.post("/bulk-update")
async def bulk_update(req: dict, db: Session = Depends(get_db)):
    for sid in req['ids']:
        s = db.query(AdSetSetting).filter(AdSetSetting.id == sid).first()
        if not s: 
            s = AdSetSetting(id=sid)
            db.add(s)
        s.limit_perc = float(req['limit_perc'])
    db.add(ActionLog(user=req.get('user', 'Sistema'), msg=f"Masivo a {len(req['ids'])} AdSets con límite: {req['limit_perc']}%"))
    db.commit()
    return {"ok": True}

@router.post("/automation/toggle")
async def toggle_auto(req: dict, db: Session = Depends(get_db)):
    auto = db.query(AutomationState).first()
    if auto:
        auto.is_active = not auto.is_active
        db.add(ActionLog(user=req['user'], msg=f"{'Encendió' if auto.is_active else 'Apagó'} automatización"))
        db.commit()
        return {"is_active": auto.is_active}
    return {"is_active": False}

@router.post("/bid")
async def update_bid(req: dict, request: Request, db: Session = Depends(get_db)):
    """
    Endpoint de la Fase 1 para actualizar límite de puja
    """
    bid = req.get('bid_amount')
    if bid is None:
        return {"ok": False, "msg": "No bid amount provided"}
    
    # Meta API require bid_amount en centavos o equivalente, o como número si la cuenta lo permite. Asumimos centavos si es dict, o string valid.
    # El Frontend mandará el valor raw que haya puesto el usuario
    res = await request.app.state.client.post(
        f"https://graph.facebook.com/{settings.API_VERSION}/{req['id']}", 
        params={"bid_amount": int(bid), "access_token": settings.META_ACCESS_TOKEN}
    )
    if res.status_code == 200:
        db.add(ActionLog(user=req.get('user', 'Global'), msg=f"Ajustó Puja a {bid} en {req['id']}"))
        db.commit()
        clear_meta_cache()
        return {"ok": True}
    return {"ok": False, "msg": str(res.json())}

@router.get("/medios")
async def get_medios(request: Request):
    """
    Endpoint Fase 3: Lista los adsets con sus anuncios anidados (Ads).
    """
    url = f"https://graph.facebook.com/{settings.API_VERSION}/{settings.META_AD_ACCOUNT_ID}/adsets"
    params = {
        "fields": "id,name,status,ads{id,name,status}", 
        "access_token": settings.META_ACCESS_TOKEN, 
        "limit": "500"
    }
    try:
        res = await request.app.state.client.get(url, params=params)
        data = res.json().get("data", [])
        return {"data": data}
    except Exception as e:
        return {"data": [], "error": str(e)}

@router.post("/medios/toggle")
async def toggle_medio(req: dict, request: Request, db: Session = Depends(get_db)):
    """
    Endpoint Fase 3: Altera el Ad Activo, apagando el anterior.
    """
    ad_id_on = req.get('ad_id_on')
    ad_id_off = req.get('ad_id_off')
    
    if ad_id_on:    
        await request.app.state.client.post(
            f"https://graph.facebook.com/{settings.API_VERSION}/{ad_id_on}", 
            params={"status": "ACTIVE", "access_token": settings.META_ACCESS_TOKEN}
        )
    if ad_id_off:
        await request.app.state.client.post(
            f"https://graph.facebook.com/{settings.API_VERSION}/{ad_id_off}", 
            params={"status": "PAUSED", "access_token": settings.META_ACCESS_TOKEN}
        )
        
    db.add(ActionLog(user=req.get('user', 'Global'), msg=f"Rotación Medio: ON({ad_id_on}) - OFF({ad_id_off})"))
    db.commit()
    return {"ok": True}
