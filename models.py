from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, Enum
from sqlalchemy.orm import relationship
from database import Base
import enum

class RoleEnum(str, enum.Enum):
    client = "client"
    manager = "manager"
    admin = "admin"

class StatusEnum(str, enum.Enum):
    pending = "забронировано"
    confirmed = "подтверждено"
    issued = "выдано"
    returned = "возвращено"
    overdue = "просрочено"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(Enum(RoleEnum), default=RoleEnum.client)

class EquipStatus(str, enum.Enum):
    available = "доступно"
    confirmed = "подтверждено"
    rented = "выдано"
    repair = "в ремонте"
    written_off = "списано"

class Equipment(Base):
    __tablename__ = "equipment"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    category = Column(String, index=True)
    price_per_day = Column(Float)
    quantity = Column(Integer)
    condition = Column(String, default="отличное") 
    image_url = Column(String, default="https://via.placeholder.com/150") # <--- ДОБАВИЛИ ФОТО
    status = Column(Enum(EquipStatus), default=EquipStatus.available)     # <--- ДОБАВИЛИ СТАТУС

class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    equipment_id = Column(Integer, ForeignKey("equipment.id"))
    start_date = Column(Date)
    end_date = Column(Date)
    total_price = Column(Float)
    status = Column(Enum(StatusEnum), default=StatusEnum.pending)
    penalty = Column(Float, default=0.0)