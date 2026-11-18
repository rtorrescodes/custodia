"use client"

import { useState, useTransition } from "react"
import { draftLease } from "@/app/actions/lease.actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X } from "lucide-react"

export type PropertyOption = {
  id: string
  nombre: string
}

interface Props {
  properties: PropertyOption[]
  onClose: () => void
  onSuccess: () => void
}

export function LeaseFormModal({ properties, onClose, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    
    const data = {
      propertyId: formData.get("propertyId") as string,
      renterName: formData.get("renterName") as string,
      renterEmail: formData.get("renterEmail") as string,
      startDate: formData.get("startDate") as string,
      endDate: formData.get("endDate") as string,
      rentAmount: Number(formData.get("rentAmount")),
      depositAmount: Number(formData.get("depositAmount")),
      paymentDay: Number(formData.get("paymentDay")),
      gracePeriodDays: Number(formData.get("gracePeriodDays") || 5),
      lateFeeFixedAmount: formData.get("lateFeeFixedAmount") ? Number(formData.get("lateFeeFixedAmount")) : undefined,
    }

    if (!data.propertyId) {
      setError("Debes seleccionar una propiedad")
      return
    }

    startTransition(async () => {
      try {
        const res = await draftLease(data)
        if (res?.error) throw new Error(res.error)
        onSuccess()
      } catch (err: any) {
        setError(err.message || "Ocurrió un error inesperado")
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-neutral-900 rounded-xl shadow-2xl w-full max-w-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-neutral-100 dark:border-neutral-800">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Nuevo Contrato (Draft)
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 px-6 py-3 border-b border-yellow-100 dark:border-yellow-900/30">
          <p className="text-xs text-yellow-800 dark:text-yellow-500">
            <strong>Fase Legal:</strong> Primero crearás el borrador del contrato. Una vez que lo autorices y subas evidencia fotográfica, se le enviará un correo al inquilino para que pueda acceder y programar sus pagos.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="propertyId">Propiedad a Rentar</Label>
              <select
                id="propertyId"
                name="propertyId"
                required
                className="w-full h-10 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5955D1]"
              >
                <option value="">Selecciona una propiedad...</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="renterName">Nombre del Inquilino</Label>
                <Input id="renterName" name="renterName" required placeholder="Juan Pérez" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="renterEmail">Correo del Inquilino</Label>
                <Input id="renterEmail" name="renterEmail" type="email" required placeholder="juan@ejemplo.com" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Fecha de Inicio</Label>
                <Input id="startDate" name="startDate" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">Fecha de Fin</Label>
                <Input id="endDate" name="endDate" type="date" required />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rentAmount">Monto Renta (MXN)</Label>
                <Input id="rentAmount" name="rentAmount" type="number" min="1" step="0.01" required placeholder="15000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="depositAmount">Depósito en Garantía</Label>
                <Input id="depositAmount" name="depositAmount" type="number" min="0" step="0.01" required placeholder="15000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentDay">Día de Cobro</Label>
                <Input id="paymentDay" name="paymentDay" type="number" min="1" max="31" required placeholder="Ej. 1" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <div className="space-y-2">
                <Label htmlFor="gracePeriodDays">Días de Gracia para Pago</Label>
                <Input id="gracePeriodDays" name="gracePeriodDays" type="number" min="0" max="30" defaultValue="5" placeholder="5" />
                <p className="text-[11px] text-muted-foreground">Días tras el vencimiento antes de generar mora.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lateFeeFixedAmount">Recargo Fijo por Mora ($ MXN)</Label>
                <Input id="lateFeeFixedAmount" name="lateFeeFixedAmount" type="number" min="0" step="0.01" defaultValue="500" placeholder="Ej. 500" />
                <p className="text-[11px] text-muted-foreground">Cobro adicional si el inquilino paga a destiempo.</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending} className="bg-[#5955D1] hover:bg-[#4b47b4] text-white">
              {isPending ? "Guardando..." : "Crear Borrador"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
