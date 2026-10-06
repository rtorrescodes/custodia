"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { UploadCloud, CheckCircle2, AlertCircle, FileText, Loader2, X } from "lucide-react"
import { reportOwnerContributionAction } from "@/app/actions/property-operations.actions"

interface TransferReportModalProps {
  isOpen: boolean
  onClose: () => void
  contribution: {
    id: string
    motivo: string
    monto: number
    moneda: string
    solicitadoEn: string
  } | null
  onSuccess: (data: any) => void
}

export function TransferReportModal({
  isOpen,
  onClose,
  contribution,
  onSuccess,
}: TransferReportModalProps) {
  const [reference, setReference] = useState("")
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().split("T")[0])
  const [reportedAmount, setReportedAmount] = useState(() => contribution ? String(contribution.monto) : "")
  const [notes, setNotes] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileBase64, setFileBase64] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successInfo, setSuccessInfo] = useState<string | null>(null)

  // Sincronizar estado cuando se abre o cambia la aportación
  useEffect(() => {
    if (contribution) {
      setReportedAmount(String(contribution.monto))
      setTransferDate(new Date().toISOString().split("T")[0])
      setErrorMessage(null)
    }
  }, [contribution?.id, contribution?.monto, isOpen])

  if (!isOpen || !contribution) return null

  const requestedAmount = contribution.monto
  const effectiveReported = reportedAmount || (contribution ? String(contribution.monto) : "")
  const effectiveDate = transferDate || new Date().toISOString().split("T")[0]
  const currentReportedNum = parseFloat(effectiveReported || "0") || 0
  const discrepancy = currentReportedNum !== requestedAmount

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setErrorMessage(null)
    const file = e.target.files?.[0]
    if (!file) return

    // Validar tamaño máximo 10MB
    const MAX_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      setErrorMessage("El archivo excede el límite máximo de 10MB.")
      setSelectedFile(null)
      setFileBase64(null)
      return
    }

    // Validar tipo MIME permitido
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"]
    if (!allowedTypes.includes(file.type)) {
      setErrorMessage("Tipo de archivo no permitido. Solo se aceptan PDF, JPG o PNG.")
      setSelectedFile(null)
      setFileBase64(null)
      return
    }

    setSelectedFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // Extraer solo la parte base64 sin el encabezado data:...;base64,
      const base64Clean = result.split(",")[1] || result
      setFileBase64(base64Clean)
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!contribution) return
    if (!reference.trim()) {
      setErrorMessage("La referencia o folio SPEI es obligatoria.")
      return
    }

    const numToSubmit = parseFloat(effectiveReported) || 0
    if (numToSubmit <= 0) {
      setErrorMessage("El importe reportado debe ser mayor a 0.")
      return
    }

    setLoading(true)
    setErrorMessage(null)

    try {
      const res = await reportOwnerContributionAction({
        contributionId: contribution.id,
        reference: reference.trim(),
        transferDate: effectiveDate,
        reportedAmount: numToSubmit,
        reportedCurrency: contribution.moneda,
        notes: notes.trim() || undefined,
        fileBase64: fileBase64 || undefined,
        fileName: selectedFile?.name || undefined,
        fileMimeType: selectedFile?.type || undefined,
      })

      if (res.success && res.data) {
        setSuccessInfo(res.data.message || "Transferencia reportada. Pendiente de verificar recepción.")
        onSuccess(res.data)
        setTimeout(() => {
          onClose()
          setSuccessInfo(null)
          setReference("")
          setSelectedFile(null)
          setFileBase64(null)
        }, 1800)
      } else {
        setErrorMessage(res.error || "Ocurrió un error al reportar la transferencia.")
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Error al conectar con el servidor.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
    >
      <div className="relative w-full max-w-lg p-6 bg-card border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Cabecera */}
        <div className="pb-3 border-b border-border flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">Reportar transferencia bancaria</h3>
              <Badge variant="outline" className="font-mono text-xs">
                Destino: PM Escrow
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Motivo: <strong className="text-foreground">{contribution.motivo}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground rounded-lg p-1 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {successInfo ? (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
            <CheckCircle2 className="size-12 text-emerald-600 animate-bounce" />
            <h4 className="text-sm font-bold text-foreground">
              Transferencia reportada. Pendiente de verificar recepción.
            </h4>
            <p className="text-xs text-muted-foreground max-w-sm">
              La administración PM revisará el comprobante bancario. Este reporte no incrementa automáticamente tus fondos disponibles hasta su acreditación formal.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-4 text-xs">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2 text-xs">
                <AlertCircle className="size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Comparativa Solicitado vs Reportado */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/40 border border-border">
              <div>
                <span className="text-muted-foreground text-[11px] block">Importe Solicitado:</span>
                <span className="font-mono font-bold text-sm text-foreground">
                  ${requestedAmount.toLocaleString()} {contribution.moneda}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground text-[11px] block">Importe Reportado:</span>
                <span className="font-mono font-bold text-sm text-primary">
                  ${currentReportedNum.toLocaleString()} {contribution.moneda}
                </span>
              </div>
              {discrepancy && (
                <div className="col-span-2 pt-1 border-t border-border/60 text-[11px] text-amber-600 font-medium flex items-center gap-1">
                  <AlertCircle className="size-3.5" />
                  Diferencia detectada (${(currentReportedNum - requestedAmount).toLocaleString()} {contribution.moneda}). Quedará visible para revisión administrativa.
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-foreground block mb-1">
                  Referencia / Folio SPEI *
                </label>
                <Input
                  required
                  placeholder="Ej. SPEI-98472615 o Clave de Rastreo"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-foreground block mb-1">
                  Fecha de Transferencia *
                </label>
                <Input
                  type="date"
                  required
                  value={effectiveDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-foreground block mb-1">
                  Importe Efectivamente Transferido *
                </label>
                <Input
                  type="number"
                  step="any"
                  required
                  placeholder={String(requestedAmount)}
                  value={effectiveReported}
                  onChange={(e) => setReportedAmount(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-foreground block mb-1">
                  Moneda
                </label>
                <Input
                  disabled
                  value={contribution.moneda}
                  className="h-9 text-xs bg-muted font-mono"
                />
              </div>
            </div>

            {/* Subida de archivo privado */}
            <div>
              <label className="font-semibold text-foreground block mb-1">
                Comprobante de Transferencia (PDF, JPG, PNG - Máx. 10MB)
              </label>
              <div className="border-2 border-dashed border-border rounded-xl p-3 text-center hover:bg-muted/30 transition-colors">
                <input
                  type="file"
                  id="evidence-file-input"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="evidence-file-input"
                  className="cursor-pointer flex flex-col items-center justify-center gap-1.5"
                >
                  {selectedFile ? (
                    <div className="flex items-center gap-2 text-foreground font-medium">
                      <FileText className="size-4 text-primary" />
                      <span>{selectedFile.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  ) : (
                    <>
                      <UploadCloud className="size-6 text-muted-foreground" />
                      <span className="text-xs text-primary font-medium hover:underline">
                        Selecciona tu comprobante
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Guardado en bóveda privada con enlace temporal firmado
                      </span>
                    </>
                  )}
                </label>
              </div>
            </div>

            <div>
              <label className="font-semibold text-foreground block mb-1">
                Notas Adicionales (Opcional)
              </label>
              <textarea
                placeholder="Ej. Transferido desde Bancomer a nombre del titular..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full text-xs rounded-xl border border-input bg-background p-2.5 resize-none h-16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={loading}
                className="rounded-xl text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={loading}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl text-xs px-4"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                    Enviando comprobante...
                  </>
                ) : (
                  "Reportar transferencia"
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
