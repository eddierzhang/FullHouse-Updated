from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.restaurant import crud, schemas
from app.restaurant.models import InventoryItem, MenuItem, Order, OrderItem, Shift, Staff, Supplier

router = APIRouter(prefix="/api/v1/restaurant", tags=["restaurant"])


@router.get("/menu-items", response_model=list[schemas.MenuItemOut])
def list_menu_items(db: Session = Depends(get_db)):
    return crud.list_menu_items(db)


@router.post("/menu-items", response_model=schemas.MenuItemOut)
def create_menu_item(payload: schemas.MenuItemCreate, db: Session = Depends(get_db)):
    item = MenuItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/inventory-items", response_model=list[schemas.InventoryItemOut])
def list_inventory_items(db: Session = Depends(get_db)):
    return crud.list_inventory_items(db)


@router.post("/inventory-items", response_model=schemas.InventoryItemOut)
def create_inventory_item(payload: schemas.InventoryItemCreate, db: Session = Depends(get_db)):
    item = InventoryItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/suppliers", response_model=list[schemas.SupplierOut])
def list_suppliers(db: Session = Depends(get_db)):
    return crud.list_suppliers(db)


@router.post("/suppliers", response_model=schemas.SupplierOut)
def create_supplier(payload: schemas.SupplierCreate, db: Session = Depends(get_db)):
    supplier = Supplier(**payload.model_dump())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.get("/staff", response_model=list[schemas.StaffOut])
def list_staff(db: Session = Depends(get_db)):
    return crud.list_staff(db)


@router.post("/staff", response_model=schemas.StaffOut)
def create_staff(payload: schemas.StaffCreate, db: Session = Depends(get_db)):
    staff = Staff(**payload.model_dump())
    db.add(staff)
    db.commit()
    db.refresh(staff)
    return staff


@router.get("/shifts", response_model=list[schemas.ShiftOut])
def list_shifts(db: Session = Depends(get_db)):
    return list(db.query(Shift).order_by(Shift.date, Shift.start_time))


@router.post("/shifts", response_model=schemas.ShiftOut)
def create_shift(payload: schemas.ShiftCreate, db: Session = Depends(get_db)):
    if not db.get(Staff, payload.staff_id):
        raise HTTPException(404, "Staff member not found")
    shift = Shift(**payload.model_dump())
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return shift


@router.get("/orders", response_model=list[schemas.OrderOut])
def list_orders(db: Session = Depends(get_db)):
    return list(db.query(Order).order_by(Order.created_at.desc()))


@router.post("/orders", response_model=schemas.OrderOut)
def create_order(payload: schemas.OrderCreate, db: Session = Depends(get_db)):
    order = Order(channel=payload.channel, table_number=payload.table_number, status="completed")
    total = 0.0
    for line in payload.items:
        menu_item = db.get(MenuItem, line.menu_item_id)
        if not menu_item:
            raise HTTPException(404, f"Menu item {line.menu_item_id} not found")
        unit_price = menu_item.price
        total += unit_price * line.qty
        order.items.append(
            OrderItem(menu_item_id=menu_item.id, qty=line.qty, unit_price=unit_price, notes=line.notes)
        )
    order.total = total
    db.add(order)
    db.commit()
    db.refresh(order)
    return order
