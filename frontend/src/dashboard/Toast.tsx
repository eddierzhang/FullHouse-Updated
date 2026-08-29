export type ToastState = { title: string; subtitle?: string } | null

export function Toast({ toast }: { toast: ToastState }) {
  return (
    <div className={`toast${toast ? ' show' : ''}`}>
      <span>✓</span>
      <div>
        <strong>{toast?.title ?? ''}</strong>
        <small>{toast?.subtitle ?? ''}</small>
      </div>
    </div>
  )
}
