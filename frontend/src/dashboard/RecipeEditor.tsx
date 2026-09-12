import { useEffect, useState } from 'react'
import { type InventoryItem, type Recipe, getRecipe, setRecipe } from '../api/client'

type Props = {
  menuItemId: string
  ingredients: InventoryItem[]
  onSaved: () => void
  onClose: () => void
  showToast: (title: string, subtitle?: string) => void
}

type Draft = { inventory_item_id: string; quantity: string }

const money = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

export function RecipeEditor({ menuItemId, ingredients, onSaved, onClose, showToast }: Props) {
  const [recipe, setRecipeState] = useState<Recipe | null>(null)
  const [draft, setDraft] = useState<Draft[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getRecipe(menuItemId)
      .then((loaded) => {
        setRecipeState(loaded)
        setDraft(
          loaded.lines.map((line) => ({
            inventory_item_id: line.inventory_item_id,
            quantity: String(line.quantity),
          })),
        )
      })
      .catch((err) => showToast('Could not load the recipe', String(err)))
  }, [menuItemId, showToast])

  const byId = new Map(ingredients.map((i) => [i.id, i]))

  // Priced live off the draft, so the margin moves as you type.
  const projectedCost = draft.reduce((sum, line) => {
    const ingredient = byId.get(line.inventory_item_id)
    const quantity = Number(line.quantity)
    return sum + (ingredient && Number.isFinite(quantity) ? ingredient.unit_cost * quantity : 0)
  }, 0)

  const price = recipe?.price ?? 0
  const projectedMargin = price > 0 ? ((price - projectedCost) / price) * 100 : 0

  const save = async () => {
    const lines = draft
      .filter((line) => line.inventory_item_id && Number(line.quantity) > 0)
      .map((line) => ({
        inventory_item_id: line.inventory_item_id,
        quantity: Number(line.quantity),
      }))
    const ids = new Set(lines.map((l) => l.inventory_item_id))
    if (ids.size !== lines.length) {
      showToast('The same ingredient is listed twice')
      return
    }

    setBusy(true)
    try {
      await setRecipe(menuItemId, lines)
      showToast(lines.length ? 'Recipe saved' : 'Recipe cleared')
      onSaved()
      onClose()
    } catch (err) {
      showToast('Could not save the recipe', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!recipe) return <div className="rcp-panel">Loading…</div>

  return (
    <div className="rcp-panel">
      <div className="rcp-head">
        <div>
          <p className="kicker">RECIPE</p>
          <strong>{recipe.menu_item_name}</strong>
        </div>
        <div className="rcp-figures">
          <span>
            {money(projectedCost)}
            <small>ingredient cost</small>
          </span>
          <span>
            {projectedMargin.toFixed(1)}%
            <small>margin at {money(price)}</small>
          </span>
        </div>
      </div>

      {draft.length === 0 && (
        <p className="rcp-empty">
          No recipe yet, so this dish's cost is whatever was typed in and selling it consumes
          nothing from stock.
        </p>
      )}

      {draft.map((line, index) => {
        const ingredient = byId.get(line.inventory_item_id)
        return (
          <div className="rcp-line" key={index}>
            <select
              value={line.inventory_item_id}
              onChange={(e) => {
                const next = [...draft]
                next[index] = { ...line, inventory_item_id: e.target.value }
                setDraft(next)
              }}
            >
              <option value="">Choose an ingredient…</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({money(i.unit_cost)}/{i.unit})
                </option>
              ))}
            </select>
            <input
              inputMode="decimal"
              placeholder="Qty"
              value={line.quantity}
              onChange={(e) => {
                const next = [...draft]
                next[index] = { ...line, quantity: e.target.value }
                setDraft(next)
              }}
            />
            <span className="rcp-unit">{ingredient?.unit ?? ''}</span>
            <span className="rcp-cost">
              {ingredient && Number(line.quantity) > 0
                ? money(ingredient.unit_cost * Number(line.quantity))
                : '—'}
            </span>
            <button
              className="emp-remove"
              title="Remove ingredient"
              onClick={() => setDraft(draft.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </div>
        )
      })}

      <div className="rcp-actions">
        <button
          className="secondary-button"
          onClick={() => setDraft([...draft, { inventory_item_id: '', quantity: '' }])}
        >
          Add ingredient
        </button>
        <button className="secondary-button" onClick={onClose}>
          Close
        </button>
        <button className="approve-button" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save recipe'}
        </button>
      </div>
    </div>
  )
}
