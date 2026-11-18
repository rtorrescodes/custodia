"use client"

import { Button } from "@/components/ui/button"
import { QrCode } from "lucide-react"
import { generateQrAction } from "@/app/actions/alddea.actions"

export function QrButtonClient({ alddeaId }: { alddeaId: string }) {
  const handleGenerateQR = async () => {
    const visitorName = prompt("Ingresa el nombre del visitante para el Pase QR:");
    if (!visitorName) return;

    try {
      const res = await generateQrAction(alddeaId, visitorName);
      if (res.success) {
        alert("Pase QR generado correctamente! URL: " + res.data.passUrl);
      } else {
        alert("Error: " + res.error);
      }
    } catch (e) {
      alert("Error al intentar generar el pase QR.");
    }
  }

  return (
    <Button 
      variant="outline" 
      className="rounded-xl border-[#5955D1] text-[#5955D1] hover:bg-[#5955D1]/10"
      onClick={handleGenerateQR}
    >
      <QrCode className="mr-2 size-4" />
      Generar Pase QR (Alddea)
    </Button>
  )
}
