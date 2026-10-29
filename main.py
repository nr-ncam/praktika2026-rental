from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from typing import List

import models, schemas, auth, database

models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="Прокат Оборудования API")

# --- АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ ---
@app.post("/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(auth.get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Пользователь с таким именем уже существует")
    
    hashed_password = auth.get_password_hash(user.password)
    
    # ЖЕСТКО ЗАДАЕМ РОЛЬ КЛИЕНТА ПРИ РЕГИСТРАЦИИ
    new_user = models.User(
        username=user.username, 
        hashed_password=hashed_password, 
        role=models.RoleEnum.client 
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.get("/users/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    """Возвращает данные текущего авторизованного пользователя (включая роль)"""
    return current_user

# ... (эндпоинт /token оставляем как было) ...

# --- УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ (Только для Админа) ---
@app.get("/admin/users", response_model=List[schemas.UserResponse])
def get_all_users(current_user: models.User = Depends(auth.check_role(models.RoleEnum.admin)), db: Session = Depends(auth.get_db)):
    return db.query(models.User).all()

@app.put("/admin/users/{user_id}/role")
def update_user_role(user_id: int, new_role: models.RoleEnum, current_user: models.User = Depends(auth.check_role(models.RoleEnum.admin)), db: Session = Depends(auth.get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    user.role = new_role
    db.commit()
    return {"message": f"Роль пользователя {user.username} изменена на {new_role.value}"}

@app.post("/token", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(auth.get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    access_token = auth.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

# --- КАТАЛОГ (Клиент) ---
@app.get("/equipment", response_model=List[schemas.EquipmentResponse])
def get_equipment(search: str = None, category: str = None, db: Session = Depends(auth.get_db)):
    query = db.query(models.Equipment)
    if search:
        query = query.filter(models.Equipment.name.contains(search))
    if category:
        query = query.filter(models.Equipment.category == category)
    return query.all()

# --- БРОНИРОВАНИЕ ---
@app.post("/bookings", response_model=schemas.BookingResponse)
def create_booking(booking: schemas.BookingCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(auth.get_db)):
    # Проверка пересечения дат
    overlapping = db.query(models.Booking).filter(
        models.Booking.equipment_id == booking.equipment_id,
        models.Booking.status.in_([
            models.StatusEnum.pending, 
            models.StatusEnum.confirmed,
            models.StatusEnum.issued
        ]),
        models.Booking.start_date <= booking.end_date,
        models.Booking.end_date >= booking.start_date
    ).first()
    
    if overlapping:
        raise HTTPException(status_code=400, detail="Оборудование уже забронировано на эти даты")

    equipment = db.query(models.Equipment).filter(models.Equipment.id == booking.equipment_id).first()
    if not equipment or equipment.quantity < 1:
         raise HTTPException(status_code=400, detail="Оборудование недоступно")

    # Автоматический расчет стоимости
    days = (booking.end_date - booking.start_date).days
    if days <= 0: days = 1
    total_price = days * equipment.price_per_day

    new_booking = models.Booking(
        user_id=current_user.id,
        equipment_id=booking.equipment_id,
        start_date=booking.start_date,
        end_date=booking.end_date,
        total_price=total_price,
        status=models.StatusEnum.pending
    )
    db.add(new_booking)
    db.commit()
    db.refresh(new_booking)
    return new_booking

@app.get("/my-bookings", response_model=List[schemas.BookingResponse])
def get_my_bookings(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(auth.get_db)):
    return db.query(models.Booking).filter(models.Booking.user_id == current_user.id).all()

# --- УПРАВЛЕНИЕ (Менеджер/Админ) ---
@app.get("/admin/bookings", response_model=List[schemas.BookingResponse])
def get_all_bookings(current_user: models.User = Depends(auth.check_role(models.RoleEnum.manager)), db: Session = Depends(auth.get_db)):
    return db.query(models.Booking).all()

@app.put("/admin/bookings/{booking_id}/status")
def update_booking_status(booking_id: int, new_status: models.StatusEnum, current_user: models.User = Depends(auth.check_role(models.RoleEnum.manager)), db: Session = Depends(auth.get_db)):
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    booking.status = new_status
    
    # Логика штрафа (если просрочено)
    if new_status == models.StatusEnum.overdue:
        booking.penalty = booking.total_price * 0.1 # Пример: штраф 10%
        
    db.commit()
    return {"message": "Status updated", "new_status": new_status}

@app.post("/admin/equipment", response_model=schemas.EquipmentResponse)
def add_equipment(eq: schemas.EquipmentBase, current_user: models.User = Depends(auth.check_role(models.RoleEnum.admin)), db: Session = Depends(auth.get_db)):
    new_eq = models.Equipment(**eq.model_dump())
    db.add(new_eq)
    db.commit()
    db.refresh(new_eq)
    return new_eq

# --- УПРАВЛЕНИЕ КАТАЛОГОМ (Только Админ) ---
@app.put("/admin/equipment/{eq_id}")
def update_equipment(eq_id: int, eq: schemas.EquipmentBase, current_user: models.User = Depends(auth.check_role(models.RoleEnum.admin)), db: Session = Depends(auth.get_db)):
    db_eq = db.query(models.Equipment).filter(models.Equipment.id == eq_id).first()
    if not db_eq:
        raise HTTPException(status_code=404, detail="Оборудование не найдено")
    db_eq.name = eq.name
    db_eq.category = eq.category
    db_eq.price_per_day = eq.price_per_day
    db_eq.quantity = eq.quantity
    db.commit()
    return {"message": "Оборудование обновлено"}

@app.delete("/admin/equipment/{eq_id}")
def delete_equipment(eq_id: int, current_user: models.User = Depends(auth.check_role(models.RoleEnum.admin)), db: Session = Depends(auth.get_db)):
    db_eq = db.query(models.Equipment).filter(models.Equipment.id == eq_id).first()
    if not db_eq:
        raise HTTPException(status_code=404, detail="Оборудование не найдено")
    db.delete(db_eq)
    db.commit()
    return {"message": "Оборудование удалено"}

# --- ФИКСАЦИЯ СОСТОЯНИЯ ПРИ ВОЗВРАТЕ (Менеджер) ---
@app.put("/admin/bookings/{booking_id}/return")
def return_equipment(booking_id: int, condition_note: str, current_user: models.User = Depends(auth.check_role(models.RoleEnum.manager)), db: Session = Depends(auth.get_db)):
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Бронирование не найдено")
    
    # Меняем статус брони
    booking.status = models.StatusEnum.returned
    
    # Меняем состояние оборудования в базе
    equipment = db.query(models.Equipment).filter(models.Equipment.id == booking.equipment_id).first()
    if equipment:
        equipment.condition = condition_note
        
    db.commit()
    return {"message": f"Оборудование возвращено. Зафиксировано состояние: {condition_note}"}

# --- СТАТИСТИКА (Админ) ---
@app.get("/admin/stats")
def get_stats(current_user: models.User = Depends(auth.check_role(models.RoleEnum.admin)), db: Session = Depends(auth.get_db)):
    total_bookings = db.query(models.Booking).count()
    revenue = db.query(func.sum(models.Booking.total_price)).scalar() or 0
    penalties = db.query(func.sum(models.Booking.penalty)).scalar() or 0
    
    # Статистика по статусам бронирований
    status_counts = db.query(models.Booking.status, func.count(models.Booking.id)).group_by(models.Booking.status).all()
    
    return {
        "total_bookings": total_bookings,
        "revenue": revenue,
        "penalties": penalties,
        "status_counts": {status.value: count for status, count in status_counts}
    }

# --- ШТРАФ ЗА ПОВРЕЖДЕНИЕ (Менеджер) ---
@app.put("/admin/bookings/{booking_id}/damage")
def set_damage_penalty(booking_id: int, damage_amount: float, current_user: models.User = Depends(auth.check_role(models.RoleEnum.manager)), db: Session = Depends(auth.get_db)):
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Бронирование не найдено")
    booking.penalty += damage_amount
    db.commit()
    return {"message": "Штраф за повреждение добавлен"}

# --- УДАЛЕНИЕ БРОНИРОВАНИЯ (Только Админ) ---
@app.delete("/admin/bookings/{booking_id}")
def delete_booking(booking_id: int, current_user: models.User = Depends(auth.check_role(models.RoleEnum.admin)), db: Session = Depends(auth.get_db)):
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Бронирование не найдено")
    
    db.delete(booking)
    db.commit()
    return {"message": "Бронирование успешно удалено из базы"}

# Подключаем фронтенд
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
