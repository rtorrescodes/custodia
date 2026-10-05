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
      label: "Saldo actual",
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
  return (
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

const UMBRAL_APROBACION = 3000 // gastos por encima requieren aprobación

import { approveTransaction } from "@/app/actions/portal.actions"

export function LedgerView({ data, propertyId }: { data: LedgerProps, propertyId: string }) {
  const [estado, setEstado] = useState<Estado>(data.estado === "vacio" ? "vacio" : "exito")
  const [transacciones, setTransacciones] = useState(data.transacciones)

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
