from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.restaurant.models import (
    InventoryItem,
    MenuItem,
    Order,
    OrderItem,
    Shift,
    Staff,
    Supplier,
)


def list_menu_items(db: Session) -> list[MenuItem]:
    return list(db.scalars(select(MenuItem).order_by(MenuItem.category, MenuItem.name)))


def list_inventory_items(db: Session) -> list[InventoryItem]:
    return list(db.scalars(select(InventoryItem).order_by(InventoryItem.name)))


def get_low_stock_items(db: Session) -> list[InventoryItem]:
    items = list_inventory_items(db)
    return [i for i in items if i.quantity_on_hand <= i.reorder_threshold]


def list_suppliers(db: Session) -> list[Supplier]:
    return list(db.scalars(select(Supplier).order_by(Supplier.name)))


def get_supplier(db: Session, supplier_id: str) -> Supplier | None:
    return db.get(Supplier, supplier_id)


def get_inventory_item(db: Session, inventory_item_id: str) -> InventoryItem | None:
    return db.get(InventoryItem, inventory_item_id)


def list_staff(db: Session) -> list[Staff]:
    return list(db.scalars(select(Staff).order_by(Staff.name)))


def list_shifts_between(db: Session, start: date, end: date) -> list[Shift]:
    return list(
        db.scalars(
            select(Shift).where(Shift.date >= start, Shift.date <= end).order_by(Shift.date, Shift.start_time)
        )
    )


def list_orders_between(db: Session, start_dt, end_dt) -> list[Order]:
    return list(
        db.scalars(
            select(Order)
            .where(Order.created_at >= start_dt, Order.created_at < end_dt, Order.status == "completed")
            .order_by(Order.created_at)
        )
    )


def list_recent_orders(db: Session, days: int = 7) -> list[Order]:
    cutoff = date.today() - timedelta(days=days)
    return list(
        db.scalars(
            select(Order)
            .where(Order.status == "completed")
            .order_by(Order.created_at.desc())
        )
    )


def top_selling_items(db: Session, limit: int = 5) -> list[tuple[MenuItem, int]]:
    counts: dict[str, int] = {}
    for oi in db.scalars(select(OrderItem)):
        counts[oi.menu_item_id] = counts.get(oi.menu_item_id, 0) + oi.qty
    ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    result = []
    for menu_item_id, qty in ranked:
        item = db.get(MenuItem, menu_item_id)
        if item:
            result.append((item, qty))
    return result

def slow_moving_items(db: Session, limit: int = 5) -> list[tuple[MenuItem, int]]:
    counts: dict[str, int] = {oi.menu_item_id: 0 for oi in db.scalars(select(OrderItem))}
    for oi in db.scalars(select(OrderItem)):
        counts[oi.menu_item_id] = counts.get(oi.menu_item_id, 0) + oi.qty
    all_items = list_menu_items(db)
    ranked = sorted(all_items, key=lambda m: counts.get(m.id, 0))[:limit]
    return [(m, counts.get(m.id, 0)) for m in ranked]
