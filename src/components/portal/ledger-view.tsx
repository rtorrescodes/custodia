"use client"

import { useState } from "react"
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Check,
  FileX2,
  TriangleAlert,
  RefreshCw,
} from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatMoney, formatDate } from "@/lib/data"
import type { LedgerProps, LedgerTransaction } from "@/lib/types"

type Estado = "exito" | "cargando" | "vacio" | "error"

function SummaryCards({ resumen }: { resumen: LedgerProps["resumen"] }) {
  const cards = [
    {
      label: "Saldo neto bajo custodia",
      value: resumen.saldoActual,
      icon: Wallet,
      tone: "bg-primary/10 text-primary",
    },
    {
      label: "Ingresos del mes",
      value: resumen.ingresosMes,
      icon: ArrowDownLeft,
      tone: "bg-success/15 text-success",
    },
    {
      label: "Egresos del mes",
      value: resumen.egresosMes,
      icon: ArrowUpRight,
      tone: "bg-destructive/10 text-destructive",
    },
  ]

  const fid = resumen.fiduciario

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className="gap-0 p-5">
            <div className={cn("flex size-10 items-center justify-center rounded-xl", c.tone)}>
              <c.icon className="size-5" />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
              {formatMoney(c.value.amount, c.value.currency)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{c.value.currency}</p>
          </Card>
        ))}
      </div>

      {fid && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Desglose de Fondos y Disponibilidad Operativa</span>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-xs font-mono font-medium",
                fid.esDeficitario
                  ? "bg-rose-500/10 text-rose-600 border border-rose-500/30"
                  : fid.reservaFaltante > 0
                  ? "bg-amber-500/10 text-amber-600 border border-amber-500/30"
                  : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
              )}>
                {fid.esDeficitario
                  ? "Cuenta con Déficit Real"
                  : fid.reservaFaltante > 0
                  ? "Reserva Parcial / Faltante"
                  : "Fondo de Reserva Completo"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-muted-foreground">Fondos Recibidos en Custodia:</p>
              <p className="font-mono font-bold text-sm text-foreground mt-0.5">
                ${fid.custodiaPmEfectiva.toLocaleString()} MXN
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Depósito Garantía (Pasivo):</p>
              <p className="font-mono font-medium text-sm text-amber-600 dark:text-amber-400 mt-0.5">
                −${fid.depositosGarantiaRetenidos.toLocaleString()} MXN
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Reserva Constituida / Meta:</p>
              <p className="font-mono font-medium text-sm text-foreground mt-0.5">
                ${fid.reservaConstituida.toLocaleString()} / ${fid.reservaMinima.toLocaleString()} MXN
              </p>
              {fid.reservaFaltante > 0 && (
                <p className="text-[10px] text-amber-600 mt-0.5">
                  Faltante por aportar: ${fid.reservaFaltante.toLocaleString()} MXN
                </p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">Compromisos Aprobados:</p>
              <p className="font-mono font-medium text-sm text-muted-foreground mt-0.5">
                −${fid.compromisosVigentes.toLocaleString()} MXN
              </p>
            </div>
            <div className="col-span-2 md:col-span-4 pt-2 border-t border-border flex items-center justify-between">
              <div>
                <span className="font-semibold text-foreground">Disponible para Nuevas Operaciones:</span>
                <p className="text-[11px] text-muted-foreground">
                  (Efectivo neto bajo custodia − Reserva constituida − Compromisos aprobados)
                </p>
              </div>
              <span className={cn(
                "text-base font-bold font-mono",
                fid.esDeficitario ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
              )}>
                ${fid.disponibleNuevasObligaciones.toLocaleString()} MXN
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-4 text-xs text-neutral-600 dark:text-neutral-400 flex flex-col sm:flex-row justify-between gap-2 items-start sm:items-center">
        <div>
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">Transparencia Financiera Fiduciaria:</span>
          <p className="mt-0.5">El disponible para liquidación deduce comisiones contractuales, gastos autorizados y reservas constituidas. Los depósitos en garantía se mantienen en custodia separada y no aumentan el saldo distribuible.</p>
        </div>
      </div>
    </div>
  )
}

function TipoBadge({ tipo }: { tipo: LedgerTransaction["tipo"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        tipo === "ingreso"
          ? "bg-success/15 text-success ring-success/30"
          : "bg-destructive/10 text-destructive ring-destructive/20",
      )}
    >
      {tipo === "ingreso" ? <ArrowDownLeft className="size-3" /> : <ArrowUpRight className="size-3" />}
      {tipo === "ingreso" ? "Ingreso" : "Egreso"}
    </span>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="gap-0 p-5">
            <Skeleton className="size-10 rounded-xl" />
            <Skeleton className="mt-4 h-4 w-24" />
            <Skeleton className="mt-2 h-7 w-32" />
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4 py-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <FileX2 className="size-7" />
        </div>
        <div>
          <p className="text-base font-semibold text-foreground">Aún no hay movimientos</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cuando registremos ingresos o gastos de tu propiedad aparecerán aquí.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <TriangleAlert className="size-7" />
        </div>
        <div>
          <p className="text-base font-semibold text-foreground">No pudimos cargar tu estado de cuenta</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ocurrió un error al obtener las transacciones. Intenta de nuevo.
          </p>
        </div>
        <Button variant="outline" onClick={onRetry} className="rounded-xl">
          <RefreshCw data-icon="inline-start" />
          Reintentar
        </Button>
      </CardContent>
    </Card>
  )
}

import { approveTransaction } from "@/app/actions/portal.actions"
import { approveQuoteAction, reportOwnerContributionAction } from "@/app/actions/property-operations.actions"

const UMBRAL_APROBACION = 3000 // gastos por encima requieren aprobación

export function LedgerView({ data, propertyId }: { data: LedgerProps, propertyId: string }) {
  const [estado, setEstado] = useState<Estado>(data.estado === "vacio" ? "vacio" : "exito")
  const [transacciones, setTransacciones] = useState(data.transacciones)
  const [quotes, setQuotes] = useState(data.cotizacionesPendientes || [])
  const [contributions, setContributions] = useState(data.aportacionesFondos || [])
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  async function aprobar(id: string) {
    try {
      const res = await approveTransaction({ transactionId: id, propertyId })
      if (res?.data?.success) {
        setTransacciones((prev) =>
          prev.map((t) => (t.id === id ? { ...t, aprobado: true } : t)),
        )
      } else {
        alert("Error aprobando la transacción")
      }
    } catch(e) {
      alert("Error aprobando")
    }
  }

  async function handleApproveQuote(quoteId: string, version: number) {
    setActionLoading(quoteId)
    try {
      const res = await approveQuoteAction({
        quoteId,
        expectedVersion: version,
        reason: "Aprobación formal del propietario desde el Portal"
      })
      if (res.success) {
        setQuotes(prev => prev.filter(q => q.id !== quoteId))
        alert("¡Cotización aprobada formalmente!")
      } else {
        alert("Error: " + (res.error || "No se pudo aprobar la cotización"))
      }
    } catch (err: any) {
      alert("Error: " + err.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReportPayment(contribId: string) {
    const ref = prompt("Ingresa la referencia o URL del comprobante de transferencia bancaria:")
    if (!ref) return
    setActionLoading(contribId)
    try {
      const res = await reportOwnerContributionAction({
        contributionId: contribId,
        evidenceUrl: ref.startsWith("http") ? ref : "https://custodia.app/evidence/" + ref,
        notes: `Transferencia reportada: ${ref}`,
      })
      if (res.success) {
        setContributions(prev => prev.map(c => c.id === contribId ? { ...c, estado: "REPORTED", reportadoEn: new Date().toISOString() } : c))
        alert("Comprobante reportado. Pendiente de verificación por la administración PM.")
      } else {
        alert("Error: " + (res.error || "No se pudo reportar el pago"))
      }
    } catch (err: any) {
      alert("Error: " + err.message)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Demo state switcher */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted p-1.5 text-sm">
        <span className="px-2 text-xs font-medium text-muted-foreground">Vista demo:</span>
        {(["exito", "cargando", "vacio", "error"] as Estado[]).map((s) => (
          <button
            key={s}
            onClick={() => setEstado(s)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
              estado === s
                ? "bg-card text-foreground ring-1 ring-foreground/10"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "exito" ? "Éxito" : s === "cargando" ? "Cargando" : s === "vacio" ? "Vacío" : "Error"}
          </button>
        ))}
      </div>

      {estado === "cargando" && <LoadingState />}
      {estado === "vacio" && (
        <>
          <SummaryCards resumen={{
            saldoActual: { amount: 0, currency: "MXN" },
            ingresosMes: { amount: 0, currency: "MXN" },
            egresosMes: { amount: 0, currency: "MXN" },
          }} />
          <EmptyState />
        </>
      )}
      {estado === "error" && <ErrorState onRetry={() => setEstado("cargando")} />}

      {estado === "exito" && (
        <>
          <SummaryCards resumen={data.resumen} />

          {/* CUS-09B: Cotizaciones que requieren autorización formal del dueño */}
          {quotes.length > 0 && (
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardHeader className="pb-3 border-b border-blue-500/20">
                <CardTitle className="text-sm font-semibold flex items-center justify-between text-blue-900 dark:text-blue-200">
                  <span className="flex items-center gap-2">
                    <TriangleAlert className="size-4 text-blue-600" />
                    Cotizaciones Pendientes de Autorización ({quotes.length})
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">Versión controlada</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border pt-2">
                {quotes.map((q) => (
                  <div key={q.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">{q.titulo}</span>
                        <span className="bg-muted px-2 py-0.5 rounded font-mono text-[11px]">v{q.version}</span>
                      </div>
                      <p className="text-muted-foreground mt-0.5">{q.descripcion || "Mantenimiento preventivo/correctivo"}</p>
                      <div className="flex gap-3 text-[11px] text-muted-foreground mt-1">
                        <span>Mano de obra: ${q.costoManoObra}</span>
                        <span>Materiales: ${q.costoMateriales}</span>
                        <span>Fecha: {new Date(q.fecha).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono font-bold text-base text-foreground">
                        ${q.costoTotal.toLocaleString()} MXN
                      </span>
                      <Button
                        size="sm"
                        disabled={actionLoading === q.id}
                        onClick={() => handleApproveQuote(q.id, q.version)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg h-8 text-xs font-semibold"
                      >
                        <Check className="size-3.5 mr-1" />
                        {actionLoading === q.id ? "Aprobando..." : "Aprobar Cotización"}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* CUS-09B: Solicitudes de aportación de fondos */}
          {contributions.length > 0 && (
            <Card className="border-purple-500/30 bg-purple-500/5">
              <CardHeader className="pb-3 border-b border-purple-500/20">
                <CardTitle className="text-sm font-semibold flex items-center justify-between text-purple-900 dark:text-purple-200">
                  <span className="flex items-center gap-2">
                    <Wallet className="size-4 text-purple-600" />
                    Solicitudes de Aportación de Fondos ({contributions.length})
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">Destino: PM_ESCROW</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border pt-2">
                {contributions.map((c) => (
                  <div key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">{c.motivo}</span>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[11px] font-medium",
                          c.estado === "VERIFIED" ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" :
                          c.estado === "REPORTED" ? "bg-blue-500/20 text-blue-700 dark:text-blue-300" :
                          "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                        )}>
                          {c.estado === "VERIFIED" ? "✓ Fondos Disponibles" :
                           c.estado === "REPORTED" ? "En Verificación PM" : "Requerido"}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-0.5">
                        Solicitado el {new Date(c.solicitadoEn).toLocaleDateString()}
                        {c.reportadoEn && ` · Comprobante enviado el ${new Date(c.reportadoEn).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono font-bold text-base text-foreground">
                        ${c.monto.toLocaleString()} {c.moneda}
                      </span>
                      {c.estado === "REQUESTED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionLoading === c.id}
                          onClick={() => handleReportPayment(c.id)}
                          className="rounded-lg h-8 text-xs font-semibold"
                        >
                          Adjuntar Comprobante
                        </Button>
                      )}
                      {c.estado === "REPORTED" && (
                        <span className="text-xs text-muted-foreground italic">Comprobante en revisión</span>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base font-semibold">Detalle de transacciones</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {/* Desktop */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-6">Fecha</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="pr-6 text-right">Recibo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transacciones.map((t) => {
                      const requiereAprob =
                        t.tipo === "egreso" && t.monto.amount >= UMBRAL_APROBACION && t.aprobacionRequerida
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="pl-6 text-sm text-muted-foreground">
                            {formatDate(t.fecha)}
                          </TableCell>
                          <TableCell>
                            <TipoBadge tipo={t.tipo} />
                          </TableCell>
                          <TableCell className="text-sm text-foreground">{t.categoria}</TableCell>
                          <TableCell className="max-w-[220px] text-sm text-foreground">
                            <span className="line-clamp-1">{t.descripcion}</span>
                            {requiereAprob && !t.aprobado && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-1.5 h-7 rounded-lg text-xs"
                                onClick={() => aprobar(t.id)}
                              >
                                Aprobar gasto
                              </Button>
                            )}
                            {requiereAprob && t.aprobado && (
                              <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-success">
                                <Check className="size-3.5" /> Aprobado
                              </span>
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-semibold tabular-nums",
                              t.tipo === "ingreso" ? "text-success" : "text-foreground",
                            )}
                          >
                            {t.tipo === "ingreso" ? "+" : "−"}
                            {formatMoney(t.monto.amount, t.monto.currency)}
                          </TableCell>
                          <TableCell className="pr-6 text-right">
                            <Button variant="ghost" size="icon" className="rounded-lg" aria-label="Ver recibo">
                              <Receipt className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile */}
              <ul className="flex flex-col divide-y divide-border md:hidden">
                {transacciones.map((t) => {
                  const requiereAprob =
                    t.tipo === "egreso" && t.monto.amount >= UMBRAL_APROBACION && t.aprobacionRequerida
                  return (
                    <li key={t.id} className="flex flex-col gap-2 px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{t.descripcion}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.categoria} · {formatDate(t.fecha)}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 font-semibold tabular-nums",
                            t.tipo === "ingreso" ? "text-success" : "text-foreground",
                          )}
                        >
                          {t.tipo === "ingreso" ? "+" : "−"}
                          {formatMoney(t.monto.amount, t.monto.currency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <TipoBadge tipo={t.tipo} />
                        <div className="flex items-center gap-2">
                          {requiereAprob && !t.aprobado && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-lg text-xs"
                              onClick={() => aprobar(t.id)}
                            >
                              Aprobar
                            </Button>
                          )}
                          {requiereAprob && t.aprobado && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                              <Check className="size-3.5" /> Aprobado
                            </span>
                          )}
                          <Button variant="ghost" size="icon" className="size-8 rounded-lg" aria-label="Ver recibo">
                            <Receipt className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
