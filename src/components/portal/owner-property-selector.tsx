"use client"

import { useRouter, useSearchParams } from "next/navigation"

interface PropertyOption {
  id: string
  nombre: string
}

export function OwnerPropertySelector({
  properties,
  selectedPropId,
  currentLang
}: {
  properties: PropertyOption[]
  selectedPropId: string
  currentLang: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextId = e.target.value
    const params = new URLSearchParams(searchParams.toString())
    params.set("propertyId", nextId)
    params.set("lang", currentLang)
    router.push(`/portal?${params.toString()}`)
  }

  return (
    <select
      aria-label="Seleccionar inmueble"
      className="text-sm bg-background/80 border border-border text-foreground rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-primary font-medium shadow-xs"
      value={selectedPropId}
      onChange={handleSelect}
    >
      {properties.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nombre}
        </option>
      ))}
    </select>
  )
}
