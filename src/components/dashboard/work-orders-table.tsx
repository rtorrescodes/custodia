import { Card, CardHeader, CardTitle, CardAction, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/status-badge"
import { formatMoney, formatDate } from "@/lib/data"
import type { WorkOrder } from "@/lib/types"

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
}

export function WorkOrdersTable({ ordenes }: { ordenes: WorkOrder[] }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base font-semibold">Órdenes de trabajo recientes</CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm">
            Ver todas
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        {/* Desktop table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">ID</TableHead>
                <TableHead>Propiedad</TableHead>
                <TableHead>Asignado a</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="pr-6 text-right">Costo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenes.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="pl-6 font-mono text-xs font-medium text-muted-foreground">
                    {o.id}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{o.propiedad}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="size-7">
                        <AvatarFallback className="bg-accent text-[11px] font-semibold text-accent-foreground">
                          {iniciales(o.asignadoA)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-foreground">{o.asignadoA}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge estado={o.estado} />
                  </TableCell>
                  <TableCell className="pr-6 text-right font-semibold tabular-nums text-foreground">
                    {formatMoney(o.costo.amount, o.costo.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile list */}
        <ul className="flex flex-col divide-y divide-border md:hidden">
          {ordenes.map((o) => (
            <li key={o.id} className="flex flex-col gap-3 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{o.propiedad}</p>
                  <p className="font-mono text-xs text-muted-foreground">{o.id} · {formatDate(o.fecha)}</p>
                </div>
                <StatusBadge estado={o.estado} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-accent text-[11px] font-semibold text-accent-foreground">
                      {iniciales(o.asignadoA)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-muted-foreground">{o.asignadoA}</span>
                </div>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatMoney(o.costo.amount, o.costo.currency)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
