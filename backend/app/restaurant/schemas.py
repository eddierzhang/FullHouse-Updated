from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict


class SupplierOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    contact_info: str | None
    lead_time_days: int


class SupplierCreate(BaseModel):
    name: str
    contact_info: str | None = None
    lead_time_days: int = 3


class InventoryItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    unit: str
    quantity_on_hand: float
    reorder_threshold: float
    reorder_qty: float
    unit_cost: float
    supplier_id: str | None


class InventoryItemCreate(BaseModel):
    name: str
    unit: str
    quantity_on_hand: float = 0
    reorder_threshold: float = 0
    reorder_qty: float = 0
    unit_cost: float = 0
    supplier_id: str | None = None


class MenuItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    category: str
    price: float
    cost: float
    is_available: bool
    description: str | None


class MenuItemCreate(BaseModel):
    name: str
    category: str
    price: float
    cost: float = 0
    is_available: bool = True
    description: str | None = None


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    menu_item_id: str
    qty: int
    unit_price: float
    notes: str | None


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    status: str
    channel: str
    table_number: int | None
    total: float
    created_at: datetime
    items: list[OrderItemOut]


class OrderItemCreate(BaseModel):
    menu_item_id: str
    qty: int = 1
    notes: str | None = None


class OrderCreate(BaseModel):
    channel: str = "dine_in"
    table_number: int | None = None
    items: list[OrderItemCreate]


class StaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    role: str
    email: str | None


class StaffCreate(BaseModel):
    name: str
    role: str
    email: str | None = None


class ShiftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    staff_id: str
    date: date
    start_time: time
    end_time: time
    role: str


class ShiftCreate(BaseModel):
    staff_id: str
    date: date
    start_time: time
    end_time: time
    role: str
