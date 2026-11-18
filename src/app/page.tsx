import { AppShell } from "@/components/app-shell"
import { KpiCards } from "@/components/dashboard/kpi-cards"
import { WorkOrdersTable } from "@/components/dashboard/work-orders-table"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { Cable, CircleCheck, AlertTriangle, Building, Layers, ShieldCheck } from "lucide-react"
import { getDashboardData } from "@/lib/services/queries"
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard"

const integraciones = [
  { nombre: "Alddea", ok: true, descripcion: "Domótica y control perimetral (QRs)" },
  { nombre: "RAVSIS", ok: false, descripcion: "Videovigilancia vecinal" },
  { nombre: "Stripe Connect", ok: true, descripcion: "Dispersión y pasarela (CUS-03)" },
]

export default async function DashboardPage() {
  const { usuario, kpis, ordenesRecientes } = await getDashboardData()

  const isLandlord = usuario.rol === "LANDLORD"

  return (
    <AppShell
      title={`Buen día, ${usuario.nombre.split("@")[0]}`}
      breadcrumb="Inicio / Hoy"
      usuario={usuario}
      alertas={kpis.alertasCriticas}
    >
      <div className="flex flex-col gap-6">
        {/* Asistente de Experiencia Bimodal si no hay unidades configuradas o como control */}
        <OnboardingWizard 
          initialMode={isLandlord ? "LANDLORD" : "PROPERTY_MANAGER"}
          hasUnits={kpis.totalUnidadesRentables > 0}
          hasLeases={true}
        />

        {/* Desglose Fidedigno de Jerarquía de Inmuebles vs Unidades */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Building className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Inmuebles Físicos</p>
              <p className="text-xl font-bold text-foreground">{kpis.totalPropiedades}</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <Layers className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Unidades Rentables</p>
              <p className="text-xl font-bold text-foreground">{kpis.totalUnidadesRentables}</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Unidades Propias</p>
              <p className="text-xl font-bold text-foreground">{kpis.unidadesPropias}</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
              <Layers className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Administradas a Terceros</p>
              <p className="text-xl font-bold text-foreground">{kpis.unidadesTerceros}</p>
            </div>
          </Card>
        </div>

        {/* KPI Cards Estándar */}
        <KpiCards kpis={kpis} />

        {/* Advertencia de Trazabilidad Fiduciaria (Honestidad de Negocio para CUS-02) */}
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-5 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <span className="font-semibold">Control de Trazabilidad Financiera (Línea Base CUS-01):</span> Los montos reflejados corresponden a ingresos y egresos registrados. La separación matemática fiduciaria de depósitos en garantía, comisiones de administración de PM y saldo neto distribuible para el propietario se procesará de forma auditada en el paquete CUS-02.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <WorkOrdersTable ordenes={ordenesRecientes} />
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Cable className="size-4 text-primary" />
                  Ecosistema e Integraciones
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {integraciones.map((i) => (
                  <div
                    key={i.nombre}
                    className="flex items-center justify-between rounded-xl border border-border p-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{i.nombre}</p>
                      <p className="text-xs text-muted-foreground">{i.descripcion}</p>
                    </div>
                    {i.ok ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500">
                        <CircleCheck className="size-4" /> Activa
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        Pendiente
                      </span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
