from datetime import date, datetime, timedelta, timezone

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


def menu_performance(db: Session) -> list[dict]:
    """Per-item sales and margin -- the numbers the marketing agent reasons about.

    Aggregated in SQL rather than by walking every order line in Python,
    which is what `top_selling_items` does.
    """
    from sqlalchemy import func

    sold = {
        menu_item_id: (units or 0, revenue or 0.0)
        for menu_item_id, units, revenue in db.execute(
            select(
                OrderItem.menu_item_id,
                func.sum(OrderItem.qty),
                func.sum(OrderItem.qty * OrderItem.unit_price),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.status == "completed")
            .group_by(OrderItem.menu_item_id)
        )
    }

    rows = []
    for item in list_menu_items(db):
        units, revenue = sold.get(item.id, (0, 0.0))
        unit_margin = item.price - item.cost
        rows.append(
            {
                "id": item.id,
                "name": item.name,
                "category": item.category,
                "price": item.price,
                "cost": item.cost,
                "description": item.description,
                "is_available": item.is_available,
                "units_sold": int(units),
                "revenue": round(float(revenue), 2),
                "margin": round(unit_margin, 2),
                "margin_pct": round((unit_margin / item.price) * 100, 1) if item.price else 0.0,
                # What this dish has actually contributed, not just its unit margin.
                "profit": round(unit_margin * units, 2),
            }
        )
    rows.sort(key=lambda r: r["units_sold"], reverse=True)
    return rows


def profit_summary(db: Session, days: int = 30) -> dict:
    """Revenue, cost of goods and gross profit over a trailing window.

    COGS comes from each line's menu-item cost, so gross profit here is
    only as good as those hand-entered costs -- nothing ties a dish to
    the ingredients it actually consumes.
    """
    from sqlalchemy import func

    # UTC throughout: created_at is stored in UTC, so bucketing against a
    # local "today" drops the current day's orders out of the daily series
    # while still counting them in the total.
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=days - 1)

    line_value = OrderItem.qty * OrderItem.unit_price
    line_cost = OrderItem.qty * MenuItem.cost

    sold = (
        select(Order, OrderItem, MenuItem)
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(MenuItem, MenuItem.id == OrderItem.menu_item_id)
        .where(Order.status == "completed", func.date(Order.created_at) >= start.isoformat())
    )

    by_day: dict[str, dict] = {}
    by_category: dict[str, dict] = {}
    by_channel: dict[str, dict] = {}
    order_ids: set[str] = set()
    revenue = cogs = 0.0

    for order, item, menu_item in db.execute(sold):
        day = order.created_at.date().isoformat()
        value = item.qty * item.unit_price
        cost = item.qty * menu_item.cost
        revenue += value
        cogs += cost
        order_ids.add(order.id)

        day_row = by_day.setdefault(day, {"date": day, "revenue": 0.0, "cogs": 0.0, "orders": set()})
        day_row["revenue"] += value
        day_row["cogs"] += cost
        day_row["orders"].add(order.id)

        cat = by_category.setdefault(
            menu_item.category, {"category": menu_item.category, "revenue": 0.0, "profit": 0.0, "units": 0}
        )
        cat["revenue"] += value
        cat["profit"] += value - cost
        cat["units"] += item.qty

        chan = by_channel.setdefault(order.channel, {"channel": order.channel, "revenue": 0.0, "orders": set()})
        chan["revenue"] += value
        chan["orders"].add(order.id)

    # Days with no trade are real zeroes, not gaps -- the line has to be continuous.
    daily = []
    for offset in range(days):
        day = (start + timedelta(days=offset)).isoformat()
        row = by_day.get(day)
        day_revenue = round(row["revenue"], 2) if row else 0.0
        day_cogs = round(row["cogs"], 2) if row else 0.0
        daily.append(
            {
                "date": day,
                "revenue": day_revenue,
                "cogs": day_cogs,
                "profit": round(day_revenue - day_cogs, 2),
                "orders": len(row["orders"]) if row else 0,
            }
        )

    inventory_value = sum(i.quantity_on_hand * i.unit_cost for i in list_inventory_items(db))
    order_count = len(order_ids)

    return {
        "days": days,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "revenue": round(revenue, 2),
        "cogs": round(cogs, 2),
        "gross_profit": round(revenue - cogs, 2),
        "margin_pct": round(((revenue - cogs) / revenue) * 100, 1) if revenue else 0.0,
        "orders": order_count,
        "average_order_value": round(revenue / order_count, 2) if order_count else 0.0,
        "inventory_value": round(inventory_value, 2),
        "daily": daily,
        "by_category": sorted(
            (
                {**c, "revenue": round(c["revenue"], 2), "profit": round(c["profit"], 2)}
                for c in by_category.values()
            ),
            key=lambda c: c["revenue"],
            reverse=True,
        ),
        "by_channel": sorted(
            (
                {"channel": c["channel"], "revenue": round(c["revenue"], 2), "orders": len(c["orders"])}
                for c in by_channel.values()
            ),
            key=lambda c: c["revenue"],
            reverse=True,
        ),
    }


def supply_chain_summary(db: Session) -> dict:
    """Supplier exposure and what needs reordering.

    "Restock cost" is each low item's `reorder_qty` at its unit cost -- what
    placing the reorder would cost, not the value of what is already there.
    """
    suppliers = {s.id: s for s in list_suppliers(db)}
    items = list_inventory_items(db)
    total_value = sum(i.quantity_on_hand * i.unit_cost for i in items)

    buckets: dict[str | None, dict] = {}
    for item in items:
        bucket = buckets.setdefault(
            item.supplier_id,
            {"item_count": 0, "stock_value": 0.0, "low_stock_count": 0, "restock_cost": 0.0},
        )
        bucket["item_count"] += 1
        bucket["stock_value"] += item.quantity_on_hand * item.unit_cost
        if item.quantity_on_hand <= item.reorder_threshold:
            bucket["low_stock_count"] += 1
            bucket["restock_cost"] += item.reorder_qty * item.unit_cost

    supplier_rows = []
    for supplier_id, supplier in suppliers.items():
        bucket = buckets.get(
            supplier_id, {"item_count": 0, "stock_value": 0.0, "low_stock_count": 0, "restock_cost": 0.0}
        )
        supplier_rows.append(
            {
                "id": supplier.id,
                "name": supplier.name,
                "contact_info": supplier.contact_info,
                "lead_time_days": supplier.lead_time_days,
                "item_count": bucket["item_count"],
                "stock_value": round(bucket["stock_value"], 2),
                "low_stock_count": bucket["low_stock_count"],
                "restock_cost": round(bucket["restock_cost"], 2),
                "share_pct": round((bucket["stock_value"] / total_value) * 100, 1) if total_value else 0.0,
            }
        )
    supplier_rows.sort(key=lambda s: s["stock_value"], reverse=True)

    low_rows = []
    for item in items:
        if item.quantity_on_hand > item.reorder_threshold:
            continue
        supplier = suppliers.get(item.supplier_id) if item.supplier_id else None
        low_rows.append(
            {
                "id": item.id,
                "name": item.name,
                "unit": item.unit,
                "quantity_on_hand": item.quantity_on_hand,
                "reorder_threshold": item.reorder_threshold,
                "reorder_qty": item.reorder_qty,
                "unit_cost": item.unit_cost,
                "supplier_id": item.supplier_id,
                "supplier_name": supplier.name if supplier else None,
                # No supplier means no lead time to plan against -- surfaced, not hidden.
                "lead_time_days": supplier.lead_time_days if supplier else None,
                "restock_cost": round(item.reorder_qty * item.unit_cost, 2),
            }
        )
    low_rows.sort(key=lambda r: (r["lead_time_days"] is None, -(r["lead_time_days"] or 0)))

    unassigned = buckets.get(
        None, {"item_count": 0, "stock_value": 0.0, "low_stock_count": 0, "restock_cost": 0.0}
    )
    lead_times = [r["lead_time_days"] for r in low_rows if r["lead_time_days"] is not None]

    return {
        "total_stock_value": round(total_value, 2),
        "supplier_count": len(supplier_rows),
        "item_count": len(items),
        "unassigned_item_count": unassigned["item_count"],
        "unassigned_stock_value": round(unassigned["stock_value"], 2),
        "low_stock_count": len(low_rows),
        "restock_cost": round(sum(r["restock_cost"] for r in low_rows), 2),
        "longest_lead_days": max(lead_times) if lead_times else 0,
        "suppliers": supplier_rows,
        "low_stock": low_rows,
    }
