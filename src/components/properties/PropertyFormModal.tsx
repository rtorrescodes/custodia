"use client"

import { useState, useTransition } from "react"
import { createProperty, updateProperty } from "@/app/actions/property.actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X } from "lucide-react"

export type PropertyFormData = {
  id?: string
  nombre: string
  direccion: string
  fraccionamiento: string
  alddeaId?: string | null
}

interface Props {
  property?: PropertyFormData | null
  onClose: () => void
  onSuccess: () => void
}

export function PropertyFormModal({ property, onClose, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!property?.id

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get("name") as string,
      address: formData.get("address") as string,
      fraccionamiento: formData.get("fraccionamiento") as string,
      alddeaId: formData.get("alddeaId") as string || "",
    }

    startTransition(async () => {
      try {
        if (isEdit && property.id) {
          const res = await updateProperty({ id: property.id, data })
          if (res?.error) throw new Error(res.error)
        } else {
          const res = await createProperty(data)
          if (res?.error) throw new Error(res.error)
        }
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
            {isEdit ? "Editar Propiedad" : "Nueva Propiedad"}
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
              <Label htmlFor="name">Nombre de la propiedad</Label>
              <Input 
                id="name" 
                name="name" 
                defaultValue={property?.nombre}
                required 
                placeholder="Ej. Villa del Sol"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Dirección completa</Label>
              <Input 
                id="address" 
                name="address" 
                defaultValue={property?.direccion}
                required 
                placeholder="Ej. Calle de las Palmas 123"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fraccionamiento">Fraccionamiento (Opcional)</Label>
              <Input 
                id="fraccionamiento" 
                name="fraccionamiento" 
                defaultValue={property?.fraccionamiento === "Independiente" ? "" : property?.fraccionamiento}
                placeholder="Ej. Punta Mita"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="alddeaId">ID de Alddea (Opcional)</Label>
              <Input 
                id="alddeaId" 
                name="alddeaId" 
                defaultValue={property?.alddeaId || ""}
                placeholder="Ej. c28bc8e9-..."
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Si está en blanco, no se generarán pases QR.</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending} className="bg-[#5955D1] hover:bg-[#4b47b4] text-white">
              {isPending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
