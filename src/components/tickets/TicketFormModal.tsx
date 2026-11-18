"use client"

import { useState, useTransition } from "react"
import { createTicket } from "@/app/actions/ticket.actions"
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

export function TicketFormModal({ properties, onClose, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    const propertyId = formData.get("propertyId") as string
    
    if (!propertyId) {
      setError("Debes seleccionar una propiedad")
      return
    }

    const data = {
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      propertyId,
      estimatedCost: formData.get("estimatedCost") ? Number(formData.get("estimatedCost")) : undefined,
    }

    startTransition(async () => {
      try {
        const res = await createTicket(data)
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
      <div className="relative bg-white dark:bg-neutral-900 rounded-xl shadow-2xl w-full max-w-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-neutral-100 dark:border-neutral-800">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Nuevo Ticket de Mantenimiento
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="propertyId">Propiedad Afectada</Label>
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

            <div className="space-y-2">
              <Label htmlFor="title">Asunto / Problema</Label>
              <Input 
                id="title" 
                name="title" 
                required 
                placeholder="Ej. Fuga de agua en lavabo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción detallada</Label>
              <textarea
                id="description"
                name="description"
                required
                rows={3}
                className="w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5955D1] resize-none"
                placeholder="Describe el problema en detalle para el técnico..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimatedCost">Costo Estimado (Opcional)</Label>
              <Input 
                id="estimatedCost" 
                name="estimatedCost" 
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending} className="bg-[#5955D1] hover:bg-[#4b47b4] text-white">
              {isPending ? "Creando..." : "Crear Ticket"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
