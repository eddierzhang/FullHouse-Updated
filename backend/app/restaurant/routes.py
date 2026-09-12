from fastapi import APIRouter, Depends, HTTPException, Query
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


@router.patch("/staff/{staff_id}", response_model=schemas.StaffOut)
def update_staff(staff_id: str, payload: schemas.StaffUpdate, db: Session = Depends(get_db)):
    staff = db.get(Staff, staff_id)
    if not staff:
        raise HTTPException(404, "Staff member not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(staff, field, value)
    db.add(staff)
    db.commit()
    db.refresh(staff)
    return staff


@router.delete("/staff/{staff_id}", status_code=204)
def delete_staff(staff_id: str, db: Session = Depends(get_db)):
    staff = db.get(Staff, staff_id)
    if not staff:
        raise HTTPException(404, "Staff member not found")

    # Shifts reference staff, and foreign keys are enforced -- refuse with an
    # explanation rather than letting the database raise an opaque error.
    shift_count = db.query(Shift).filter(Shift.staff_id == staff_id).count()
    if shift_count:
        raise HTTPException(
            409,
            f"{staff.name} still has {shift_count} scheduled "
            f"{'shift' if shift_count == 1 else 'shifts'}. Remove them first.",
        )

    db.delete(staff)
    db.commit()
    return None


@router.patch("/shifts/{shift_id}", response_model=schemas.ShiftOut)
def update_shift(shift_id: int, payload: schemas.ShiftUpdate, db: Session = Depends(get_db)):
    shift = db.get(Shift, shift_id)
    if not shift:
        raise HTTPException(404, "Shift not found")

    fields = payload.model_dump(exclude_unset=True)
    if "staff_id" in fields and not db.get(Staff, fields["staff_id"]):
        raise HTTPException(404, "Staff member not found")

    for field, value in fields.items():
        setattr(shift, field, value)
    if shift.end_time <= shift.start_time:
        raise HTTPException(422, "A shift must end after it starts")

    db.add(shift)
    db.commit()
    db.refresh(shift)
    return shift


@router.delete("/shifts/{shift_id}", status_code=204)
def delete_shift(shift_id: int, db: Session = Depends(get_db)):
    shift = db.get(Shift, shift_id)
    if not shift:
        raise HTTPException(404, "Shift not found")
    db.delete(shift)
    db.commit()
    return None


@router.get("/menu-performance", response_model=list[schemas.MenuPerformanceOut])
def menu_performance(db: Session = Depends(get_db)):
    """Every menu item with what it has actually sold and earned."""
    return crud.menu_performance(db)


@router.patch("/menu-items/{menu_item_id}", response_model=schemas.MenuItemOut)
def update_menu_item(menu_item_id: str, payload: schemas.MenuItemUpdate, db: Session = Depends(get_db)):
    item = db.get(MenuItem, menu_item_id)
    if not item:
        raise HTTPException(404, "Menu item not found")

    fields = payload.model_dump(exclude_unset=True)
    if fields.get("price") is not None and fields["price"] < 0:
        raise HTTPException(422, "Price must not be negative")
    if fields.get("cost") is not None and fields["cost"] < 0:
        raise HTTPException(422, "Cost must not be negative")

    for field, value in fields.items():
        setattr(item, field, value)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/menu-items/{menu_item_id}", status_code=204)
def delete_menu_item(menu_item_id: str, db: Session = Depends(get_db)):
    """Hard-delete, allowed only for an item that has never sold.

    Once a dish appears on an order its row is part of the sales history
    the profit and marketing agents read, so taking it off the menu means
    setting `is_available` to false, not deleting it.
    """
    item = db.get(MenuItem, menu_item_id)
    if not item:
        raise HTTPException(404, "Menu item not found")

    sold = db.query(OrderItem).filter(OrderItem.menu_item_id == menu_item_id).count()
    if sold:
        raise HTTPException(
            409,
            f"'{item.name}' appears on {sold} past order "
            f"{'line' if sold == 1 else 'lines'}; deleting it would break sales history. "
            f"Mark it unavailable instead.",
        )

    db.delete(item)
    db.commit()
    return None


@router.get("/profit-summary", response_model=schemas.ProfitSummaryOut)
def profit_summary(days: int = Query(default=30, ge=1, le=365), db: Session = Depends(get_db)):
    """Revenue, COGS and gross profit over a trailing window, with a
    continuous daily series and category/channel breakdowns."""
    return crud.profit_summary(db, days=days)


@router.get("/supply-chain", response_model=schemas.SupplyChainOut)
def supply_chain(db: Session = Depends(get_db)):
    """Supplier exposure, concentration, and what needs reordering."""
    return crud.supply_chain_summary(db)


@router.patch("/suppliers/{supplier_id}", response_model=schemas.SupplierOut)
def update_supplier(supplier_id: str, payload: schemas.SupplierUpdate, db: Session = Depends(get_db)):
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    fields = payload.model_dump(exclude_unset=True)
    if fields.get("lead_time_days") is not None and fields["lead_time_days"] < 0:
        raise HTTPException(422, "Lead time cannot be negative")

    for field, value in fields.items():
        setattr(supplier, field, value)
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.delete("/suppliers/{supplier_id}", status_code=204)
def delete_supplier(supplier_id: str, db: Session = Depends(get_db)):
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(404, "Supplier not found")

    supplied = db.query(InventoryItem).filter(InventoryItem.supplier_id == supplier_id).count()
    if supplied:
        raise HTTPException(
            409,
            f"{supplier.name} still supplies {supplied} "
            f"{'item' if supplied == 1 else 'items'}. Reassign them first.",
        )

    db.delete(supplier)
    db.commit()
    return None


@router.patch("/inventory-items/{inventory_item_id}", response_model=schemas.InventoryItemOut)
def update_inventory_item(
    inventory_item_id: str, payload: schemas.InventoryItemUpdate, db: Session = Depends(get_db)
):
    item = db.get(InventoryItem, inventory_item_id)
    if not item:
        raise HTTPException(404, "Inventory item not found")

    fields = payload.model_dump(exclude_unset=True)
    if fields.get("supplier_id") and not db.get(Supplier, fields["supplier_id"]):
        raise HTTPException(404, "Supplier not found")
    for numeric in ("quantity_on_hand", "reorder_threshold", "reorder_qty", "unit_cost"):
        if fields.get(numeric) is not None and fields[numeric] < 0:
            raise HTTPException(422, f"{numeric.replace('_', ' ')} cannot be negative")

    for field, value in fields.items():
        setattr(item, field, value)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item
