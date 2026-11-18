"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { importPropertiesCsvAction } from "@/app/actions/onboarding.actions"
import { UploadCloud, CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet } from "lucide-react"

interface CsvImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function CsvImportModal({ isOpen, onClose, onSuccess }: CsvImportModalProps) {
  const [jsonInput, setJsonInput] = useState("")
  const [mode, setMode] = useState<"ATOMIC" | "PARTIAL">("PARTIAL")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleImport = async () => {
    try {
      setLoading(true)
      setError(null)
      setResult(null)

      let parsedRows: any[] = []
      try {
        parsedRows = JSON.parse(jsonInput)
        if (!Array.isArray(parsedRows)) {
          throw new Error("El contenido debe ser un arreglo JSON de objetos.")
        }
      } catch (e: any) {
        setError(`Formato JSON inválido: ${e.message}`)
        setLoading(false)
        return
      }

      const res = await importPropertiesCsvAction({ rows: parsedRows, mode })
      if (!res.success) {
        setError(res.error || "Error al importar unidades.")
      } else {
        setResult(res.data)
        if (onSuccess) onSuccess()
      }
    } catch (e: any) {
      setError(e.message || "Error inesperado en importación.")
    } finally {
      setLoading(false)
    }
  }

  const loadSample = () => {
    const sample = [
      {
        name: "Departamento 101",
        address: "Av. Reforma 222, Depto 101, CDMX",
        managementType: "THIRD_PARTY",
        fundCustodian: "PM_ESCROW",
        unitNumber: "101"
      },
      {
        name: "Casa Lomas 5",
        address: "Paseo de las Palmas 405, CDMX",
        managementType: "OWNED",
        fundCustodian: "LANDLORD",
        unitNumber: "5"
      }
    ]
    setJsonInput(JSON.stringify(sample, null, 2))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <FileSpreadsheet className="size-5 text-primary" />
            <span>Importación de Inmuebles / Unidades</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Pega el lote de propiedades o unidades en formato estructurado. Cada fila se valida individualmente con Zod y se previenen duplicados contra la base de datos.
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">Modo de Importación:</span>
              <button
                type="button"
                onClick={() => setMode("PARTIAL")}
                className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${mode === "PARTIAL" ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground"}`}
              >
                Parcial (Recom)
              </button>
              <button
                type="button"
                onClick={() => setMode("ATOMIC")}
                className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${mode === "ATOMIC" ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground"}`}
              >
                Atómico (Todo o nada)
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={loadSample}>Cargar Ejemplo</Button>
          </div>

          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            rows={8}
            placeholder='[ { "name": "Depto 101", "address": "Calle...", "managementType": "OWNED" } ]'
            className="w-full font-mono text-xs p-3 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />

          {error && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
              <XCircle className="size-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="p-4 rounded-xl bg-accent/30 border border-border flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CheckCircle2 className="size-5 text-emerald-500" />
                <span>Resultado: {result.createdCount} creadas / {result.rejectedCount} rechazadas</span>
              </div>
              {result.warnings?.length > 0 && (
                <div className="text-xs text-amber-500 flex flex-col gap-1 mt-1">
                  {result.warnings.map((w: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-1">
                      <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
              {result.errors?.length > 0 && (
                <div className="text-xs text-destructive flex flex-col gap-1 mt-1">
                  {result.errors.map((e: any, idx: number) => (
                    <div key={idx}>• Fila {e.row} ({e.item}): {e.reason}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border bg-muted/20 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cerrar</Button>
          <Button onClick={handleImport} disabled={loading || !jsonInput.trim()}>
            {loading ? "Procesando Lote..." : "Importar Unidades"}
          </Button>
        </div>
      </div>
    </div>
  )
}
