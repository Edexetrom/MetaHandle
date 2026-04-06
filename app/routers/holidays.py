from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import HolidayConfig, ActionLog

router = APIRouter(prefix="/holidays", tags=["Holidays"])

@router.get("/")
async def get_holidays(db: Session = Depends(get_db)):
    holidays = db.query(HolidayConfig).all()
    return {"dates": [h.date for h in holidays]}

@router.post("/add")
async def add_holiday(req: dict, db: Session = Depends(get_db)):
    date_str = req.get('date') # Format YYYY-MM-DD
    if not date_str:
        return {"ok": False, "msg": "No date provided"}
        
    existing = db.query(HolidayConfig).filter(HolidayConfig.date == date_str).first()
    if not existing:
        db.add(HolidayConfig(date=date_str))
        db.add(ActionLog(user=req.get('user', 'Global'), msg=f"Agregó día festivo: {date_str}"))
        db.commit()
    return {"ok": True}

@router.post("/remove")
async def remove_holiday(req: dict, db: Session = Depends(get_db)):
    date_str = req.get('date')
    if not date_str:
        return {"ok": False, "msg": "No date provided"}
        
    date_item = db.query(HolidayConfig).filter(HolidayConfig.date == date_str).first()
    if date_item:
        db.delete(date_item)
        db.add(ActionLog(user=req.get('user', 'Global'), msg=f"Eliminó día festivo: {date_str}"))
        db.commit()
    return {"ok": True}
