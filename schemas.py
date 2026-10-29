from pydantic import BaseModel
from datetime import date
from typing import Optional
from models import RoleEnum, StatusEnum, EquipStatus

class UserCreate(BaseModel):
    username: str
    password: str
    # role: RoleEnum = RoleEnum.client

class UserResponse(BaseModel):
    id: int
    username: str
    role: RoleEnum
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class EquipmentBase(BaseModel):
    name: str
    category: str
    price_per_day: float
    quantity: int
    image_url: Optional[str] = "https://via.placeholder.com/150" 
    status: Optional[EquipStatus] = EquipStatus.available

class EquipmentResponse(EquipmentBase):
    id: int
    condition: str
    class Config:
        from_attributes = True

class BookingCreate(BaseModel):
    equipment_id: int
    start_date: date
    end_date: date

class BookingResponse(BaseModel):
    id: int
    user_id: int
    equipment_id: int
    start_date: date
    end_date: date
    total_price: float
    status: StatusEnum
    penalty: float
    class Config:
        from_attributes = True