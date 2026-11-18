"use client"

import { useState } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"

export function Gallery({ fotos, nombre }: { fotos: string[]; nombre: string }) {
  const [activa, setActiva] = useState(0)

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-muted">
        <Image
          src={fotos[activa] || "/placeholder.svg"}
          alt={`${nombre} — foto ${activa + 1}`}
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 640px"
          priority
        />
      </div>
      <div className="flex gap-3">
        {fotos.map((foto, i) => (
          <button
            key={foto}
            onClick={() => setActiva(i)}
            className={cn(
              "relative aspect-[4/3] flex-1 overflow-hidden rounded-xl ring-2 transition-all",
              activa === i ? "ring-primary" : "ring-transparent opacity-70 hover:opacity-100",
            )}
            aria-label={`Ver foto ${i + 1}`}
          >
            <Image src={foto || "/placeholder.svg"} alt="" fill className="object-cover" sizes="200px" />
          </button>
        ))}
      </div>
    </div>
  )
}
