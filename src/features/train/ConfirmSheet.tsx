import { Sheet } from '../../ui/Sheet'
import { Button } from '../../ui/Button'

interface ConfirmSheetProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  /** danger (default) for destructive confirms, primary for accent ones. */
  variant?: 'danger' | 'primary'
  onConfirm: () => void
  onClose: () => void
}

/** Small confirmation sheet: message + CTA + cancel. */
export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  variant = 'danger',
  onConfirm,
  onClose,
}: ConfirmSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button variant={variant === 'danger' ? 'danger' : undefined} fullWidth onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="ghost" fullWidth onClick={onClose} style={{ color: 'var(--text-dim)' }}>
            Cancel
          </Button>
        </div>
      }
    >
      <p style={{ margin: '0 0 8px', fontSize: 15, lineHeight: 1.45, color: 'var(--text-dim)' }}>
        {message}
      </p>
    </Sheet>
  )
}
