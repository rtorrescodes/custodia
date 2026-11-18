import { cn } from "@/lib/utils"
import type { WorkOrderStatus } from "@/lib/types"

const map: Record<WorkOrderStatus, { label: string; className: string }> = {
  pendiente: {
    label: "Pendiente",
    className: "bg-warning/15 text-warning-foreground ring-warning/30",
  },
  "en-progreso": {
    label: "En progreso",
    className: "bg-primary/10 text-primary ring-primary/20",
  },
  completada: {
    label: "Completada",
    className: "bg-success/15 text-success ring-success/30",
  },
  cancelada: {
    label: "Cancelada",
    className: "bg-muted text-muted-foreground ring-border",
  },
}

export function StatusBadge({ estado }: { estado: WorkOrderStatus }) {
  const { label, className } = map[estado]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}
