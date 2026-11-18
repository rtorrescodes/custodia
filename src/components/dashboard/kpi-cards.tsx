import { Building2, TrendingUp, Wrench, ShieldAlert, ArrowUpRight, ArrowDownRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/data"
import type { Kpi } from "@/lib/types"

function Delta({ value, positive }: { value: string; positive: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
        positive ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive",
      )}
    >
      {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {value}
    </span>
  )
}

export function KpiCards({ kpis }: { kpis: Kpi }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="gap-0 p-5">
        <div className="flex items-center justify-between">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="size-5" />
          </div>
          <Delta value="+4.2%" positive />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Total de propiedades</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">{kpis.totalPropiedades}</p>
        <p className="mt-1 text-xs text-muted-foreground">En 6 fraccionamientos</p>
      </Card>

      <Card className="gap-0 p-5">
        <div className="flex items-center justify-between">
          <div className="flex size-10 items-center justify-center rounded-xl bg-success/15 text-success">
            <TrendingUp className="size-5" />
          </div>
          <Delta value="+12%" positive />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Ingresos del mes</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">
          {formatMoney(kpis.ingresosMesUSD, "USD")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{formatMoney(kpis.ingresosMesMXN, "MXN")} MXN</p>
      </Card>

      <Card className="gap-0 p-5">
        <div className="flex items-center justify-between">
          <div className="flex size-10 items-center justify-center rounded-xl bg-warning/15 text-warning-foreground">
            <Wrench className="size-5" />
          </div>
          <Delta value="-8%" positive={false} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Órdenes de trabajo pendientes</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">{kpis.ordenesPendientes}</p>
        <p className="mt-1 text-xs text-muted-foreground">5 vencen esta semana</p>
      </Card>

      <Card className="relative gap-0 overflow-hidden p-5 ring-1 ring-destructive/20">
        <div className="flex items-center justify-between">
          <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <ShieldAlert className="size-5" />
          </div>
          <span className="inline-flex items-center rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-white">
            Crítico
          </span>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Alertas críticas de seguridad</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-destructive">{kpis.alertasCriticas}</p>
        <p className="mt-1 text-xs text-muted-foreground">Requieren atención inmediata</p>
      </Card>
    </div>
  )
}
