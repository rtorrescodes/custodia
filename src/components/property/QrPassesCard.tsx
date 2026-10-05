"use client"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { QrCode, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AlddeaPass } from "@/lib/services/alddea-bridge"

export function QrPassesCard({ passes }: { passes: AlddeaPass[] }) {
  if (passes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Pases de Acceso (Alddea)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No hay pases activos.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Pases de Acceso (Alddea)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {passes.map((p) => {
          const shareText = encodeURIComponent(`Hola ${p.visitorName}, aquí tienes tu pase de acceso: ${p.passUrl}`);
          const waUrl = `https://wa.me/?text=${shareText}`;

          return (
            <div key={p.id} className="flex items-center justify-between rounded-xl border border-border p-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-[#5955D1]/10 text-[#5955D1]">
                  <QrCode className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{p.visitorName}</p>
                  <p className="text-xs text-muted-foreground">Vence: {new Date(p.validUntil).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="icon" 
                  title="Abrir Pase"
                  onClick={() => window.open(p.passUrl, "_blank")}
                >
                  <QrCode className="size-4 text-foreground/70" />
                </Button>
                <Button 
                  variant="outline" 
                  size="icon" 
                  title="Compartir por WhatsApp"
                  onClick={() => window.open(waUrl, "_blank")}
                  className="text-green-600 border-green-200 hover:bg-green-50 dark:hover:bg-green-900/20"
                >
                  <MessageCircle className="size-4" />
                </Button>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
