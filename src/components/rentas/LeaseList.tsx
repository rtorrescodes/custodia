"use client"

import { useState } from "react"
import { Search, Plus, MapPin, CheckCircle2, Clock, Mail, FileText } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LeaseFormModal, PropertyOption } from "./LeaseFormModal"
import { authorizeLease } from "@/app/actions/lease.actions"

interface Props {
  initialLeases: any[]
  properties: PropertyOption[]
}

const statusMap: Record<string, any> = {
  "DRAFT": { label: "Borrador (Falta Aprobar)", color: "bg-neutral-100 text-neutral-800", icon: FileText },
  "PENDING_SIGNATURE": { label: "Esperando Inquilino", color: "bg-yellow-100 text-yellow-800", icon: Clock },
  "ACTIVE": { label: "Activo", color: "bg-green-100 text-green-800", icon: CheckCircle2 },
  "ENDED": { label: "Finalizado", color: "bg-red-100 text-red-800", icon: Clock },
}

export function LeaseList({ initialLeases, properties }: Props) {
  const [leases, setLeases] = useState(initialLeases)
  const [searchTerm, setSearchTerm] = useState("")
  const [isModalOpen, setIsModalOpen] = useState(false)

  const filteredLeases = leases.filter((l) => {
    return l.renter.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
           l.property.name.toLowerCase().includes(searchTerm.toLowerCase())
  })

  const handleAuthorize = async (id: string) => {
    if (!confirm("¿Seguro que deseas autorizar este contrato? Esto enviará un correo al inquilino para que configure sus pagos y firme.")) return
    try {
      const res = await authorizeLease({ leaseId: id })
      if (res?.data?.lease) {
        alert("¡Autorizado y correo enviado exitosamente!")
        window.location.reload()
      } else if (res?.error) {
        alert(res.error)
      }
    } catch (e) {
      alert("Error autorizando el contrato")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Rentas e Inquilinos</h1>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={async () => {
              const month = new Date().getMonth() + 1;
              const year = new Date().getFullYear();
              if (!confirm(`¿Generar cargos de renta para el periodo ${month}/${year}?`)) return;
              try {
                const { generateMonthlyRentChargesAction } = await import("@/app/actions/financial.actions");
                const res = await generateMonthlyRentChargesAction({ month, year });
                if (res?.data) {
                  alert(`¡${res.data.count} cargos de renta generados exitosamente!`);
                  window.location.reload();
                } else if (res?.error) {
                  alert(res.error);
                }
              } catch (e: any) {
                alert("Error generando rentas: " + e.message);
              }
            }}
            className="border-neutral-300 dark:border-neutral-700"
          >
            <Clock className="mr-2 h-4 w-4 text-neutral-600" />
            Generar Rentas del Mes
          </Button>
          <Button 
            onClick={() => setIsModalOpen(true)}
            className="bg-[#5955D1] hover:bg-[#4b47b4] text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Contrato
          </Button>
        </div>
      </div>

      <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
        <CardContent className="p-0">
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="Buscar por inquilino o propiedad..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-neutral-200 dark:border-neutral-800">
                  <TableHead>Inquilino</TableHead>
                  <TableHead>Propiedad</TableHead>
                  <TableHead>Monto y Día</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-neutral-500">
                      No hay contratos activos.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeases.map((l) => {
                    const StatusIcon = statusMap[l.status]?.icon || FileText
                    return (
                      <TableRow key={l.id} className="border-neutral-200 dark:border-neutral-800">
                        <TableCell>
                          <div className="font-medium text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                            {l.renter.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1 text-sm text-neutral-600">
                            <MapPin className="h-3 w-3" />
                            {l.property.name}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">${Number(l.rentAmount).toLocaleString()} {l.currency}</div>
                          <div className="text-xs text-neutral-500">Día {l.paymentDay} del mes</div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${statusMap[l.status]?.color}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusMap[l.status]?.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {l.status === "DRAFT" && (
                              <Button 
                                size="sm"
                                variant="outline"
                                onClick={() => handleAuthorize(l.id)}
                                className="h-8 text-[#5955D1] border-[#5955D1]/30 hover:bg-[#5955D1]/10"
                              >
                                <Mail className="h-3.5 w-3.5 mr-1.5" />
                                Enviar e Invitar
                              </Button>
                            )}
                            <Button variant="ghost" size="sm">Ver Detalles</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {isModalOpen && (
        <LeaseFormModal
          properties={properties}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false)
            window.location.reload()
          }}
        />
      )}
    </div>
  )
}
