from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import TurnConfig

router = APIRouter(prefix="/turns", tags=["Turns"])

@router.post("/update")
async def update_turn(req: dict, db: Session = Depends(get_db)):
    t = db.query(TurnConfig).filter(TurnConfig.name == req['name']).first()
    if not t: 
        t = TurnConfig(name=req['name'])
        db.add(t)
    t.start_hour = float(req['start'])
    t.end_hour = float(req['end'])
    t.days = req['days']
    db.commit()
    return {"ok": True}

@router.post("/delete")
async def delete_turn(req: dict, db: Session = Depends(get_db)):
    t = db.query(TurnConfig).filter(TurnConfig.name == req['name']).first()
    if t and t.name.lower() not in ["matutino normal", "matutino especial", "vespertino", "nocturno", "fsemana"]:
        db.delete(t)
        db.commit()
        return {"ok": True}
    return {"ok": False, "msg": "No se puede eliminar un turno predefinido"}
