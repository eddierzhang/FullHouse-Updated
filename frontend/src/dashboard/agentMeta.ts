export const AGENT_META: Record<string, { letter: string; avatarClass: string; pulseClass: string; bgClass: string }> = {
  profit: { letter: 'P', avatarClass: 'profit', pulseClass: 'pulse', bgClass: 'green-bg' },
  employee_management: { letter: 'E', avatarClass: 'people', pulseClass: 'blue-pulse', bgClass: 'blue-bg' },
  inventory: { letter: 'I', avatarClass: 'inventory', pulseClass: 'amber-pulse', bgClass: 'amber-bg' },
  supply_chain: { letter: 'S', avatarClass: 'supply', pulseClass: 'purple-pulse', bgClass: 'purple-bg' },
  marketing: { letter: 'M', avatarClass: 'marketing', pulseClass: 'coral-pulse', bgClass: 'coral-bg' },
}

export const ACTION_TYPE_META: Record<string, { tag: string; tagClass: string; symbol: string; bgClass: string }> = {
  inventory_reorder: { tag: 'Urgent', tagClass: 'urgent', symbol: '!', bgClass: 'coral-bg' },
  purchase_order: { tag: 'Review', tagClass: 'review', symbol: '♦', bgClass: 'blue-bg' },
  shift_change: { tag: 'Review', tagClass: 'review', symbol: '♙', bgClass: 'blue-bg' },
  menu_change: { tag: 'Opportunity', tagClass: 'opportunity', symbol: '↗', bgClass: 'green-bg' },
}

export function actionTitle(actionType: string, payload: Record<string, unknown>): string {
  switch (actionType) {
    case 'inventory_reorder':
      return `Reorder ${payload.quantity ?? ''} of ${payload.item_name ?? 'an item'}`
    case 'purchase_order':
      return `Purchase order: ${payload.quantity ?? ''} of ${payload.item_name ?? ''} from ${payload.supplier_name ?? 'supplier'}`
    case 'shift_change':
      return `Shift change for ${payload.staff_name ?? 'staff member'} on ${payload.date ?? ''}`
    case 'menu_change':
      return `${payload.change_type ?? 'Menu change'}: ${payload.item_name ?? ''}`
    default:
      return actionType
  }
}

export function actionDetail(_actionType: string, payload: Record<string, unknown>): string {
  const note = (payload.note as string) || (payload.details as string) || ''
  return note || 'No additional notes from the agent.'
}
