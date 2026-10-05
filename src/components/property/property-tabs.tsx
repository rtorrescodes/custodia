"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/status-badge"
import { cn } from "@/lib/utils"
import { formatMoney, formatDate } from "@/lib/data"
import type { Property } from "@/lib/types"

export function PropertyTabs({ property }: { property: Property }) {
  return (
    <Tabs defaultValue="historial" className="w-full gap-4">
      <TabsList className="w-full max-w-md">
        <TabsTrigger value="historial">Historial de mantenimiento</TabsTrigger>
        <TabsTrigger value="ledger">Ledger financiero</TabsTrigger>
      </TabsList>

      <TabsContent value="historial">
        <ol className="relative flex flex-col gap-5 border-l border-border pl-6">
          {property.historial.map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-background bg-primary" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{h.titulo}</p>
                  <p className="text-sm text-muted-foreground">{h.detalle}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{formatDate(h.fecha)}</span>
                  <StatusBadge estado={h.estado} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </TabsContent>

      <TabsContent value="ledger">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Fecha</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {property.ledger.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-sm text-muted-foreground">{formatDate(t.fecha)}</TableCell>
                <TableCell className="text-sm text-foreground">{t.categoria}</TableCell>
                <TableCell className="text-sm text-foreground">{t.descripcion}</TableCell>
                <TableCell
                  className={cn(
                    "text-right font-semibold tabular-nums",
                    t.tipo === "ingreso" ? "text-success" : "text-foreground",
                  )}
                >
                  {t.tipo === "ingreso" ? "+" : "−"}
                  {formatMoney(t.monto.amount, t.monto.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TabsContent>
    </Tabs>
  )
}
