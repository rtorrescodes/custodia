import { AppShell } from "@/components/app-shell"
import { Gallery } from "@/components/property/gallery"
import { PropertyTabs } from "@/components/property/property-tabs"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Plus, MapPin, Building, CircleCheck, TriangleAlert, CircleX, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { getPropertyData, getDashboardData } from "@/lib/services/queries"
import { getAlddeaPasses } from "@/lib/services/alddea-bridge"
import type { IntegracionEstado } from "@/lib/types"
import { QrButtonClient } from "@/components/property/QrButtonClient"
import { QrPassesCard } from "@/components/property/QrPassesCard"

const integracionUI: Record<
  IntegracionEstado,
  { icon: typeof CircleCheck; label: string; className: string }
> = {
  conectado: { icon: CircleCheck, label: "Conectado", className: "text-success" },
  error: { icon: TriangleAlert, label: "Error de conexión", className: "text-destructive" },
  desconectado: { icon: CircleX, label: "Desconectado", className: "text-muted-foreground" },
}

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getPropertyData(id);
  const dbDashboard = await getDashboardData();
  const alddeaPasses = property.alddeaId ? await getAlddeaPasses(property.alddeaId) : [];

  return (
    <AppShell
      title={property.nombre}
      breadcrumb="Propiedades / Detalle"
      usuario={dbDashboard.usuario}
      alertas={dbDashboard.kpis.alertasCriticas}
    >
      <div className="flex flex-col gap-6">
        {/* Header actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" /> {property.direccion}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Building className="size-4" /> {property.fraccionamiento}
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            {property.alddeaId && <QrButtonClient alddeaId={property.alddeaId} />}
            <Button className="rounded-xl">
              <Plus data-icon="inline-start" />
              Crear orden de trabajo
            </Button>
          </div>
        </div>

        {/* CUS-09: Cabecera Operativa Real (B) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Ocupación / Uso</span>
            <span className="text-xs font-bold text-foreground inline-flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${
                property.occupancyStatus === "RENTED" ? "bg-blue-500" :
                property.occupancyStatus === "OWNER_OCCUPIED" ? "bg-emerald-500" : "bg-amber-500"
              }`} />
              {property.occupancyStatus === "RENTED" ? "Arrendada" :
               property.occupancyStatus === "OWNER_OCCUPIED" ? "Uso Propietario" : "Desocupada / Custodia"}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Responsable PM</span>
            <span className="text-xs font-bold text-foreground truncate">
              {property.primaryManagerId ? "Asignado" : "Equipo General"}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Próxima Llegada</span>
            <span className="text-xs font-bold text-foreground">
              {property.estadias && property.estadias[0] ? new Date(property.estadias[0].fecha).toLocaleDateString() : "Sin programar"}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Decisiones Dueño</span>
            <span className={`text-xs font-bold ${
              property.ordenesConCotizacion?.filter((o: any) => o.requiereAprobacionOwner).length > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-foreground"
            }`}>
              {property.ordenesConCotizacion?.filter((o: any) => o.requiereAprobacionOwner).length || 0} pendientes
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Disponible Fiduciario</span>
            <span className="text-xs font-bold text-foreground">
              ${(property.fondosFiduciarios?.disponibleNuevasObligaciones || 0).toLocaleString()} MXN
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">Bloqueos Críticos</span>
            <span className={`text-xs font-bold ${
              property.tareasOperativas?.filter((t: any) => t.estado === "BLOCKED").length > 0
                ? "text-rose-600 dark:text-rose-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}>
              {property.tareasOperativas?.filter((t: any) => t.estado === "BLOCKED").length || 0} bloqueos
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left column */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Gallery fotos={property.fotos} nombre={property.nombre} />

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Información general</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <p className="text-sm leading-relaxed text-muted-foreground">{property.descripcion}</p>
                <div>
                  <p className="mb-3 text-sm font-semibold text-foreground">Amenidades</p>
                  <div className="flex flex-wrap gap-2">
                    {property.amenidades.map((a) => (
                      <span
                        key={a}
                        className="inline-flex items-center gap-1.5 rounded-full bg-accent/60 px-3 py-1.5 text-xs font-medium text-accent-foreground"
                      >
                        <Check className="size-3.5" />
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Copropietarios</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {property.copropietarios.map((c) => (
                  <div key={c.id} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-9">
                          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                            {c.nombre.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium text-foreground">{c.nombre}</span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {c.participacion}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${c.participacion}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Integraciones activas</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {property.integraciones.map((i) => {
                  const ui = integracionUI[i.estado as IntegracionEstado] || integracionUI.desconectado
                  const Icon = ui.icon
                  return (
                    <div
                      key={i.nombre}
                      className="flex items-center justify-between rounded-xl border border-border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground">
                          {i.nombre[0]}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{i.nombre}</p>
                          <p className="text-xs text-muted-foreground">{i.descripcion}</p>
                        </div>
                      </div>
                      <span className={cn("inline-flex items-center gap-1 text-xs font-medium", ui.className)}>
                        <Icon className="size-4" />
                        <span className="sr-only sm:not-sr-only">{ui.label}</span>
                      </span>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {property.alddeaId && <QrPassesCard passes={alddeaPasses} />}
          </div>
        </div>

        {/* Bottom tabs */}
        <Card>
          <CardContent className="pt-2">
            <PropertyTabs property={property} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
