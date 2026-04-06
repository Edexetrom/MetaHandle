import asyncio
from datetime import datetime
import pytz
import logging
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import AutomationState, TurnConfig, AdSetSetting, ActionLog, HolidayConfig
from app.services.meta_api import get_meta_data_cached
from app.config import settings
import httpx

async def automation_engine(client: httpx.AsyncClient):
    last_reset_day_0 = None
    last_reset_day_4 = None
    
    while True:
        await asyncio.sleep(45)
        db = SessionLocal()
        try:
            state = db.query(AutomationState).first()
            if not state: 
                continue
            
            mex_tz = pytz.timezone('America/Mexico_City')
            now = datetime.now(mex_tz)
            current_day_str = now.strftime('%Y-%m-%d')
            
            # --- DOBLE RESETEO DE FREEZE ---
            # Resetear a False a las 00:00 y a las 04:00 AM (Central Standard Time / MX)
            # Damos una ventana amplia (ej. min=0 o 1) y comprobamos la fecha para que se ejecute solo una vez al día.
            if now.hour == 0 and now.minute < 2 and last_reset_day_0 != current_day_str:
                db.query(AdSetSetting).update({"is_frozen": False})
                db.add(ActionLog(user="Sistema", msg=f"Doble Reseteo (Freeze Off) {now.strftime('%H:%M')}"))
                db.commit()
                last_reset_day_0 = current_day_str
                
            if now.hour == 4 and now.minute < 2 and last_reset_day_4 != current_day_str:
                db.query(AdSetSetting).update({"is_frozen": False})
                db.add(ActionLog(user="Sistema", msg=f"Doble Reseteo (Freeze Off) {now.strftime('%H:%M')}"))
                db.commit()
                last_reset_day_4 = current_day_str
            
            # --- BLINDADO NOCTURNO / MATUTINO ---
            is_night_safeguard = now.hour == 23 and now.minute >= 50
            is_morning_safeguard = now.hour == 6 and now.minute <= 10
            
            if not state.is_active and (is_night_safeguard or is_morning_safeguard):
                state.is_active = True
                db.add(ActionLog(user="Sistema", msg="Auto-ON (Blindaje)"))
                db.commit()
                
            if not state.is_active: 
                continue
            
            # --- BLACKOUT DATES (Fase 1) ---
            current_date_str = now.strftime('%Y-%m-%d')
            is_blackout = db.query(HolidayConfig).filter(HolidayConfig.date == current_date_str).first() is not None
            
            curr_h = now.hour + (now.minute / 60)
            day_of_week = now.weekday() # 0=Lunes, 4=Viernes, 5=Sábado, 6=Domingo
            
            turns = {t.name.lower(): t for t in db.query(TurnConfig).all()}
            meta_data = await get_meta_data_cached(client)
            
            for ad in meta_data:
                s = db.query(AdSetSetting).filter(AdSetSetting.id == ad['id']).first()
                if not s or s.is_frozen: continue
                
                assigned = [t.strip().lower() for t in s.turno.split(",")]
                
                # Validación de Día y Hora
                in_time = False
                for t_name in assigned:
                    turn = turns.get(t_name)
                    if not turn: continue
                    
                    time_match = turn.start_hour <= curr_h < turn.end_hour
                    day_match = False
                    days_cfg = turn.days.upper().strip()
                    
                    if days_cfg == "L-V":
                        day_match = 0 <= day_of_week <= 4
                    elif days_cfg == "S":
                        day_match = day_of_week == 5
                    elif days_cfg == "D":
                        day_match = day_of_week == 6
                    else:
                        day_map = {'L': 0, 'M': 1, 'X': 2, 'J': 3, 'V': 4, 'S': 5, 'D': 6}
                        target_days = [day_map.get(d.strip()) for d in days_cfg.split(',') if d.strip() in day_map]
                        if target_days:
                            day_match = day_of_week in target_days
                        else:
                            day_match = True
                            
                    if time_match and day_match:
                        in_time = True
                        break

                spend = float(ad.get("insights", {}).get("data", [{}])[0].get("spend", 0)) if ad.get("insights") else 0
                budget = float(ad.get("daily_budget", 0)) / 100
                over = (spend / budget * 100) >= s.limit_perc if budget > 0 else False
                
                # Blackout override: Si es día festivo, no se debe encender nada (Forzar False).
                should_be_active = in_time and not over and not is_blackout
                
                # Turn On
                if should_be_active and ad['status'] != 'ACTIVE':
                    await client.post(
                        f"https://graph.facebook.com/{settings.API_VERSION}/{ad['id']}", 
                        params={"status": "ACTIVE", "access_token": settings.META_ACCESS_TOKEN}
                    )
                # Turn Off
                elif not should_be_active and ad['status'] == 'ACTIVE':
                    await client.post(
                        f"https://graph.facebook.com/{settings.API_VERSION}/{ad['id']}", 
                        params={"status": "PAUSED", "access_token": settings.META_ACCESS_TOKEN}
                    )
        except Exception as e:
            logging.error(f"Automation Engine Error: {e}")
        finally: 
            db.close()
