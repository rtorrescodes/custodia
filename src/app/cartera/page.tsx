import { AppShell } from "@/components/app-shell"
import { getPortfolioInboxData, getDashboardData } from "@/lib/services/queries"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import {
  AlertTriangle,
  Clock,
  FileCheck2,
  DollarSign,
  Home,
  CheckCircle2,
  ArrowRight,
  ShieldAlert,
  Calendar,
  Wrench,
  Inbox
} from "lucide-react"

export const metadata = {
  title: "Control de Cartera | Custodia",
  description: "Bandeja de atención centralizada para administración de propiedades",
}

export default async function CarteraPage() {
  const dbDashboard = await getDashboardData();
  const inbox = await getPortfolioInboxData();

  return (
    <AppShell
      title="Bandeja de Atención de Cartera"
      breadcrumb="Cartera / Control Operativo"
      usuario={dbDashboard.usuario}
      alertas={inbox.totalAlertas}
    >
      <div className="flex flex-col gap-8">
        {/* Banner de resumen */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <Clock className="size-3.5" /> Tareas Críticas / Vencidas
              </CardDescription>
              <CardTitle className="text-2xl font-bold">{inbox.tareasProblema.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Requieren atención operativa inmediata</p>
            </CardContent>
          </Card>

          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                <FileCheck2 className="size-3.5" /> Cotizaciones por Decidir
              </CardDescription>
              <CardTitle className="text-2xl font-bold">{inbox.cotizacionesPendientes.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">En espera de autorización del dueño</p>
            </CardContent>
          </Card>

          <Card className="border-purple-500/20 bg-purple-500/5">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
                <DollarSign className="size-3.5" /> Aportaciones Pendientes
              </CardDescription>
              <CardTitle className="text-2xl font-bold">{inbox.aportacionesPendientes.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Fondos requeridos o por verificar</p>
            </CardContent>
          </Card>

          <Card className="border-rose-500/20 bg-rose-500/5">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                <ShieldAlert className="size-3.5" /> Visitas de Cuidado Vencidas
              </CardDescription>
              <CardTitle className="text-2xl font-bold">{inbox.propiedadesSinVisitaReciente.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Inmuebles sin inspección reciente</p>
            </CardContent>
          </Card>
        </div>

        {/* Sección 1: Tareas Vencidas o Bloqueadas */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Clock className="size-5 text-amber-500" />
                  Tareas Vencidas o Bloqueadas
                </CardTitle>
                <CardDescription>
                  Acciones que impiden el avance normal de la cartera
                </CardDescription>
              </div>
              <Badge variant="outline" className="font-mono">{inbox.tareasProblema.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {inbox.tareasProblema.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <CheckCircle2 className="size-8 text-emerald-500 opacity-60" />
                No hay tareas vencidas ni bloqueadas en la cartera.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {inbox.tareasProblema.map((t) => (
                  <div key={t.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground truncate">{t.titulo}</span>
                        {t.estado === "BLOCKED" ? (
                          <Badge variant="destructive" className="text-xs">Bloqueada</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Vencida</Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">{t.prioridad}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Inmueble: <span className="font-medium text-foreground">{t.propiedadNombre}</span>
                        {t.motivoBloqueo && (
                          <span className="ml-2 text-rose-600 dark:text-rose-400">· Motivo: {t.motivoBloqueo}</span>
                        )}
                      </p>
                    </div>
                    <Link
                      href={`/propiedades/${t.propiedadId}`}
                      className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/80 transition-colors shrink-0"
                    >
                      Resolver <ArrowRight className="size-3.5 ml-1" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sección 2: Cotizaciones Pendientes de Decisión del Dueño */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <FileCheck2 className="size-5 text-blue-500" />
                  Cotizaciones en Espera de Aprobación
                </CardTitle>
                <CardDescription>
                  Presupuestos que exceden la facultad del PM o requieren decisión explícita
                </CardDescription>
              </div>
              <Badge variant="outline" className="font-mono">{inbox.cotizacionesPendientes.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {inbox.cotizacionesPendientes.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <CheckCircle2 className="size-8 text-emerald-500 opacity-60" />
                Todas las cotizaciones se encuentran atendidas.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {inbox.cotizacionesPendientes.map((q) => (
                  <div key={q.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground truncate">{q.ordenTitulo}</span>
                        <Badge variant="outline" className="text-xs">Versión {q.version}</Badge>
                        <span className="text-xs font-bold text-foreground">
                          ${q.montoTotal.toLocaleString()} {q.moneda}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Propiedad: <span className="font-medium text-foreground">{q.propiedadNombre}</span>
                      </p>
                    </div>
                    <Link
                      href={`/propiedades/${q.propiedadId}`}
                      className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/80 transition-colors shrink-0"
                    >
                      Ver Detalle <ArrowRight className="size-3.5 ml-1" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sección 3: Inmuebles sin Visita Preventiva Reciente */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Home className="size-5 text-rose-500" />
                  Inmuebles sin Visita de Cuidado Reciente
                </CardTitle>
                <CardDescription>
                  Propiedades desocupadas o bajo custodia que han superado el ciclo de inspección programado
                </CardDescription>
              </div>
              <Badge variant="outline" className="font-mono">{inbox.propiedadesSinVisitaReciente.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {inbox.propiedadesSinVisitaReciente.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <CheckCircle2 className="size-8 text-emerald-500 opacity-60" />
                Todas las propiedades tienen inspecciones y visitas de cuidado al día.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {inbox.propiedadesSinVisitaReciente.map((p) => (
                  <div key={p.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground truncate">{p.nombre}</span>
                        <Badge variant="secondary" className="text-xs">{p.cartera}</Badge>
                        <Badge variant="outline" className="text-xs">Ciclo cada {p.frecuenciaDias} días</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.direccion} · Última visita:{" "}
                        <span className="font-medium text-foreground">
                          {p.ultimaVisita ? new Date(p.ultimaVisita).toLocaleDateString() : "Sin registro previo"}
                        </span>
                      </p>
                    </div>
                    <Link
                      href={`/propiedades/${p.id}`}
                      className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/80 transition-colors shrink-0"
                    >
                      Programar Visita <ArrowRight className="size-3.5 ml-1" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
