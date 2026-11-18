"use client"

import React, { useState } from "react"
import { 
  Building2, 
  CreditCard, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Upload, 
  Wrench, 
  Clock, 
  DollarSign, 
  ShieldCheck,
  Send,
  Calendar,
  FileCheck2
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { signLeaseAgreementAction } from "@/app/actions/lease.actions"
import { reportTenantPaymentAction } from "@/app/actions/financial.actions"
import { createTenantMaintenanceRequestAction } from "@/app/actions/ticket.actions"

interface RenterPortalProps {
  initialData: {
    leases: any[]
    maintenanceTickets: any[]
    user: any
  }
}

export function RenterPortalView({ initialData }: RenterPortalProps) {
  const [leases, setLeases] = useState(initialData.leases || [])
  const [tickets, setTickets] = useState(initialData.maintenanceTickets || [])
  const user = initialData.user

  const activeLease = leases.find(l => l.status === "ACTIVE" || l.status === "PENDING_SIGNATURE") || leases[0]

  // Estado para modal de firma digital
  const [isSigning, setIsSigning] = useState(false)
  const [signingName, setSigningName] = useState(user?.name || "")
  const [signingConsent, setSigningConsent] = useState(false)
  const [signingLoading, setSigningLoading] = useState(false)

  // Estado para reporte de pago
  const [paymentAmount, setPaymentAmount] = useState(activeLease ? String(activeLease.rentAmount) : "")
  const [paymentRef, setPaymentRef] = useState("")
  const [paymentNotes, setPaymentNotes] = useState("")
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState("")

  // Estado para ticket de mantenimiento
  const [ticketTitle, setTicketTitle] = useState("")
  const [ticketDesc, setTicketDesc] = useState("")
  const [ticketUrgency, setTicketUrgency] = useState<"LOW" | "MEDIUM" | "HIGH" | "EMERGENCY">("MEDIUM")
  const [ticketLoading, setTicketLoading] = useState(false)
  const [ticketSuccessMsg, setTicketSuccessMsg] = useState("")

  // Handler para Firma Digital
  async function handleSignAgreement(e: React.FormEvent) {
    e.preventDefault()
    if (!activeLease || !signingConsent || !signingName.trim()) return

    setSigningLoading(true)
    try {
      const res = await signLeaseAgreementAction({
        leaseId: activeLease.id,
        signerFullName: signingName.trim(),
        consentAccepted: true,
        notes: "Firmado digitalmente desde el Portal del Inquilino Custodia.",
      })

      if (res.success && res.data) {
        setLeases(leases.map(l => l.id === activeLease.id ? { ...l, status: "ACTIVE", signedAt: res.data?.signedAt } : l))
        setIsSigning(false)
        alert("¡Contrato firmado y activado exitosamente!")
      } else {
        alert("Error al firmar contrato: " + (res.error || "No se pudo procesar la firma"))
      }
    } finally {
      setSigningLoading(false)
    }
  }

  // Handler para Reportar Pago (Transferencia / SPEI)
  async function handleReportPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!activeLease || !paymentAmount || !paymentRef.trim()) return

    setPaymentLoading(true)
    setPaymentSuccessMsg("")
    try {
      const res = await reportTenantPaymentAction({
        leaseId: activeLease.id,
        amount: parseFloat(paymentAmount),
        reference: paymentRef.trim(),
        method: "TRANSFER",
        notes: paymentNotes.trim() || undefined,
      })

      if (res.success && res.data) {
        setPaymentSuccessMsg("✅ " + res.data.message)
        setPaymentRef("")
        setPaymentNotes("")
        // Agregar pago a la lista localmente
        const newPayment = {
          id: res.data.paymentId,
          amount: res.data.amount,
          reference: res.data.reference,
          status: res.data.status,
          method: "TRANSFER",
          createdAt: new Date().toISOString(),
        }
        setLeases(leases.map(l => {
          if (l.id === activeLease.id) {
            return {
              ...l,
              payments: [newPayment, ...(l.payments || [])]
            }
          }
          return l
        }))
      } else {
        alert("Error al reportar pago: " + (res.error || "Verifique los datos"))
      }
    } finally {
      setPaymentLoading(false)
    }
  }

  // Handler para Reportar Falla de Mantenimiento
  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault()
    if (!activeLease || !ticketTitle.trim() || !ticketDesc.trim()) return

    setTicketLoading(true)
    setTicketSuccessMsg("")
    try {
      const res = await createTenantMaintenanceRequestAction({
        propertyId: activeLease.propertyId,
        title: ticketTitle.trim(),
        description: ticketDesc.trim(),
        urgency: ticketUrgency,
      })

      if (res.success && res.data) {
        setTicketSuccessMsg("✅ " + res.data.message)
        setTickets([res.data.ticket, ...tickets])
        setTicketTitle("")
        setTicketDesc("")
        setTicketUrgency("MEDIUM")
      } else {
        alert("Error al reportar mantenimiento: " + (res.error || "No se pudo enviar"))
      }
    } finally {
      setTicketLoading(false)
    }
  }

  if (!activeLease) {
    return (
      <Card className="border-border/60 bg-background/50 backdrop-blur-sm">
        <CardContent className="py-16 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mb-5 ring-1 ring-border/50">
            <FileText className="size-8 text-muted-foreground/60" />
          </div>
          <h3 className="text-xl font-bold text-foreground tracking-tight">No hay contratos vinculados</h3>
          <p className="text-muted-foreground max-w-sm mt-2.5 font-medium leading-relaxed text-sm">
            Actualmente no tienes ningún contrato de arrendamiento activo asociado a tu cuenta.
          </p>
        </CardContent>
      </Card>
    )
  }

  const charges = activeLease.charges || []
  const payments = activeLease.payments || []

  return (
    <div className="space-y-6">
      {/* Banner de firma pendiente */}
      {activeLease.status === "PENDING_SIGNATURE" && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3.5">
            <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-amber-900 dark:text-amber-300 tracking-tight text-base">
                Contrato Pendiente de Firma Digital
              </h3>
              <p className="text-xs font-medium text-amber-800/80 dark:text-amber-400/80 mt-1 leading-relaxed">
                El casero/administrador ha cargado tu contrato de arrendamiento. Firma en línea para activar el contrato y habilitar tus servicios.
              </p>
            </div>
          </div>
          <Button 
            onClick={() => setIsSigning(!isSigning)} 
            className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 font-semibold text-xs rounded-xl"
          >
            {isSigning ? "Ocultar Contrato" : "✍️ Revisar y Firmar en Línea"}
          </Button>
        </div>
      )}

      {/* Formulario / Modal expandido de firma digital */}
      {isSigning && activeLease.status === "PENDING_SIGNATURE" && (
        <Card className="border-amber-500/40 bg-card shadow-lg animate-in fade-in duration-300">
          <CardHeader className="pb-3 border-b border-border/60">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck2 className="size-5 text-amber-600" />
              Firma Digital y Consentimiento de Arrendamiento
            </CardTitle>
            <CardDescription className="text-xs">
              Validez jurídica vinculante bajo registro de estampa de tiempo e identidad digital.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="p-4 bg-muted/40 rounded-xl border border-border/50 text-xs space-y-2 text-muted-foreground leading-relaxed">
              <p className="font-semibold text-foreground">Resumen de Cláusulas Principales:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Inmueble:</strong> {activeLease.property.name} ({activeLease.property.address})</li>
                <li><strong>Renta Mensual:</strong> ${Number(activeLease.rentAmount).toLocaleString()} {activeLease.currency} (Día {activeLease.paymentDay} de cada mes)</li>
                <li><strong>Vigencia:</strong> Del {new Date(activeLease.startDate).toLocaleDateString()} al {new Date(activeLease.endDate).toLocaleDateString()}</li>
                <li><strong>Depósito en Garantía:</strong> ${Number(activeLease.depositAmount || 0).toLocaleString()} {activeLease.currency}</li>
                <li><strong>Días de Gracia para Pago:</strong> {activeLease.gracePeriodDays || 5} días naturales.</li>
              </ul>
            </div>

            <form onSubmit={handleSignAgreement} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-foreground block mb-1">Nombre Completo del Titular Firmante</label>
                <Input 
                  value={signingName} 
                  onChange={(e) => setSigningName(e.target.value)} 
                  required 
                  placeholder="Tu nombre legal completo" 
                  className="h-9 text-xs"
                />
              </div>

              <div className="flex items-start gap-2.5 pt-1">
                <input 
                  type="checkbox" 
                  id="consent" 
                  checked={signingConsent} 
                  onChange={(e) => setSigningConsent(e.target.checked)} 
                  className="mt-0.5 rounded border-input size-4 text-primary focus:ring-primary"
                  required
                />
                <label htmlFor="consent" className="text-xs text-muted-foreground leading-normal cursor-pointer select-none">
                  Acepto expresamente los términos, condiciones y vigencia del presente contrato de arrendamiento. Reconozco que esta firma electrónica tiene plena validez jurídica.
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsSigning(false)}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  size="sm" 
                  disabled={!signingConsent || !signingName.trim() || signingLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                >
                  {signingLoading ? "Registrando firma..." : "Confirmar y Firmar Contrato"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tabs principales del Portal del Inquilino */}
      <Tabs defaultValue="contract" className="w-full">
        <TabsList className="grid grid-cols-4 w-full h-11 p-1 bg-muted/60 rounded-xl">
          <TabsTrigger value="contract" className="text-xs font-semibold">
            <FileText className="size-3.5 mr-1.5 hidden sm:inline" /> Mi Contrato
          </TabsTrigger>
          <TabsTrigger value="payments" className="text-xs font-semibold">
            <DollarSign className="size-3.5 mr-1.5 hidden sm:inline" /> Pagos y Recibos
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="text-xs font-semibold">
            <Wrench className="size-3.5 mr-1.5 hidden sm:inline" /> Mantenimiento
          </TabsTrigger>
          <TabsTrigger value="amenities" className="text-xs font-semibold">
            <Building2 className="size-3.5 mr-1.5 hidden sm:inline" /> Propiedad
          </TabsTrigger>
        </TabsList>

        {/* 1. Mi Contrato */}
        <TabsContent value="contract" className="space-y-4 pt-3">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Contrato de Arrendamiento</CardTitle>
                  <CardDescription className="text-xs">Estado legal y condiciones pactadas</CardDescription>
                </div>
                <Badge 
                  variant="outline" 
                  className={`text-xs font-semibold ${
                    activeLease.status === "ACTIVE" 
                      ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/10" 
                      : "text-amber-600 border-amber-500/30 bg-amber-500/10"
                  }`}
                >
                  {activeLease.status === "ACTIVE" ? "✓ Contrato Activo" : "Pendiente de Firma"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 p-4 rounded-xl bg-muted/30 border border-border/50">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Inmueble</span>
                  <span className="font-semibold text-foreground text-sm">{activeLease.property.name}</span>
                  <p className="text-[11px] text-muted-foreground">{activeLease.property.address}</p>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Renta Mensual</span>
                  <span className="font-bold text-foreground text-sm font-mono">
                    ${Number(activeLease.rentAmount).toLocaleString()} {activeLease.currency}
                  </span>
                  <p className="text-[11px] text-muted-foreground">Vence día {activeLease.paymentDay} de cada mes</p>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Periodo de Vigencia</span>
                  <span className="font-medium text-foreground">
                    {new Date(activeLease.startDate).toLocaleDateString()} - {new Date(activeLease.endDate).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Depósito en Garantía</span>
                  <span className="font-semibold text-foreground font-mono">
                    ${Number(activeLease.depositAmount || 0).toLocaleString()} {activeLease.currency}
                  </span>
                  <p className="text-[10px] text-emerald-600">Bajo resguardo fiduciario</p>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Días de Gracia para Pago</span>
                  <span className="font-medium text-foreground">{activeLease.gracePeriodDays || 5} días naturales</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Firma Digital Registrada</span>
                  <span className="font-medium text-foreground">
                    {activeLease.signedAt ? new Date(activeLease.signedAt).toLocaleString() : "No firmada aún"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. Pagos y Recibos */}
        <TabsContent value="payments" className="space-y-4 pt-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Columna Izquierda: Reportar pago por transferencia */}
            <Card className="md:col-span-1 border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Upload className="size-4 text-primary" /> Reportar Transferencia
                </CardTitle>
                <CardDescription className="text-xs">
                  Notifica tu depósito SPEI o en efectivo al casero
                </CardDescription>
              </CardHeader>
              <CardContent>
                {paymentSuccessMsg && (
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-xs mb-3 font-medium">
                    {paymentSuccessMsg}
                  </div>
                )}
                <form onSubmit={handleReportPayment} className="space-y-3 text-xs">
                  <div>
                    <label className="font-medium text-foreground">Importe Depositado ($ MXN)</label>
                    <Input 
                      type="number" 
                      step="any" 
                      value={paymentAmount} 
                      onChange={(e) => setPaymentAmount(e.target.value)} 
                      required 
                      className="h-8 text-xs font-mono mt-1"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-foreground">Clave de Rastreo / Folio SPEI</label>
                    <Input 
                      value={paymentRef} 
                      onChange={(e) => setPaymentRef(e.target.value)} 
                      placeholder="Ej. SPEI-BBVA-99214" 
                      required 
                      className="h-8 text-xs font-mono mt-1"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-foreground">Notas Adicionales (Opcional)</label>
                    <Input 
                      value={paymentNotes} 
                      onChange={(e) => setPaymentNotes(e.target.value)} 
                      placeholder="Ej. Pago de renta de noviembre" 
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={paymentLoading || !paymentAmount || !paymentRef.trim()} 
                    className="w-full h-8 text-xs font-semibold rounded-lg bg-primary text-primary-foreground"
                  >
                    {paymentLoading ? "Enviando reporte..." : "Enviar Comprobante de Pago"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Columna Derecha: Estado de cuenta y cargos */}
            <Card className="md:col-span-2 border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Clock className="size-4 text-primary" /> Estado de Cuenta y Recibos
                </CardTitle>
                <CardDescription className="text-xs">Historial de mensualidades y estatus de liquidación</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h5 className="font-semibold text-xs text-foreground">Cargos y Mensualidades:</h5>
                  {charges.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3 text-center">No hay cargos de renta registrados aún.</p>
                  ) : (
                    charges.map((c: any) => (
                      <div key={c.id} className="p-3 rounded-xl border border-border/60 bg-card flex items-center justify-between text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">{c.concept}</span>
                            <Badge 
                              variant="outline" 
                              className={`text-[10px] ${
                                c.status === "PAID" 
                                  ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/5" 
                                  : "text-amber-600 border-amber-500/30 bg-amber-500/5"
                              }`}
                            >
                              {c.status === "PAID" ? "Pagado" : "Pendiente"}
                            </Badge>
                          </div>
                          <span className="text-[11px] text-muted-foreground">Vencimiento: {new Date(c.dueDate).toLocaleDateString()}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold font-mono text-sm text-foreground">
                            ${Number(c.amount).toLocaleString()} {c.currency}
                          </span>
                          {c.amountPaid > 0 && c.status !== "PAID" && (
                            <p className="text-[10px] text-muted-foreground">Abonado: ${Number(c.amountPaid).toLocaleString()}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-border/40">
                  <h5 className="font-semibold text-xs text-foreground">Pagos y Comprobantes Recientes:</h5>
                  {payments.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">No hay pagos reportados.</p>
                  ) : (
                    payments.map((p: any) => (
                      <div key={p.id} className="p-2.5 rounded-lg border border-border/40 bg-muted/20 flex items-center justify-between text-xs">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground">Ref: {p.reference || "Sin ref"}</span>
                            <Badge 
                              variant="outline" 
                              className={`text-[9px] ${
                                p.status === "CONFIRMED" 
                                  ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/5" 
                                  : "text-blue-600 border-blue-500/30 bg-blue-500/5"
                              }`}
                            >
                              {p.status === "CONFIRMED" ? "Confirmado" : "En Revisión"}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <span className="font-bold font-mono text-foreground">${Number(p.amount).toLocaleString()} MXN</span>
                          {p.receipt && (
                            <p className="text-[10px] text-primary font-medium">Recibo #{p.receipt.receiptNumber}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 3. Mantenimiento e Incidencias */}
        <TabsContent value="maintenance" className="space-y-4 pt-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="md:col-span-1 border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Wrench className="size-4 text-primary" /> Reportar Falla o Avería
                </CardTitle>
                <CardDescription className="text-xs">
                  Avisa al propietario sobre fugas, fallas eléctricas o desperfectos
                </CardDescription>
              </CardHeader>
              <CardContent>
                {ticketSuccessMsg && (
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-xs mb-3 font-medium">
                    {ticketSuccessMsg}
                  </div>
                )}
                <form onSubmit={handleCreateTicket} className="space-y-3 text-xs">
                  <div>
                    <label className="font-medium text-foreground">Título del Problema</label>
                    <Input 
                      value={ticketTitle} 
                      onChange={(e) => setTicketTitle(e.target.value)} 
                      placeholder="Ej. Fuga en lavabo de baño principal" 
                      required 
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-foreground">Descripción Detallada</label>
                    <Input 
                      value={ticketDesc} 
                      onChange={(e) => setTicketDesc(e.target.value)} 
                      placeholder="Indica cuándo empezó y si gotea mucho..." 
                      required 
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-foreground">Nivel de Urgencia</label>
                    <select 
                      value={ticketUrgency} 
                      onChange={(e: any) => setTicketUrgency(e.target.value)}
                      className="w-full h-8 rounded-lg border border-input bg-background px-2 text-xs mt-1"
                    >
                      <option value="LOW">Baja (Puede esperar unos días)</option>
                      <option value="MEDIUM">Media (Atención normal)</option>
                      <option value="HIGH">Alta (Afecta el uso del inmueble)</option>
                      <option value="EMERGENCY">Emergencia (Fuga mayor, riesgo)</option>
                    </select>
                  </div>
                  <Button 
                    type="submit" 
                    disabled={ticketLoading || !ticketTitle.trim() || !ticketDesc.trim()} 
                    className="w-full h-8 text-xs font-semibold rounded-lg bg-primary text-primary-foreground"
                  >
                    {ticketLoading ? "Enviando reporte..." : "Levantar Reporte de Mantenimiento"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="md:col-span-2 border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Tus Reportes de Incidencias</CardTitle>
                <CardDescription className="text-xs">Seguimiento de reparaciones atendidas por administración</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {tickets.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">No tienes tickets de mantenimiento abiertos.</p>
                ) : (
                  tickets.map((t: any) => (
                    <div key={t.id} className="p-3 rounded-xl border border-border/60 bg-card space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground text-sm">{t.title}</span>
                        <Badge 
                          variant="outline" 
                          className={`text-[10px] ${
                            t.status === "COMPLETED" 
                              ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/5" 
                              : t.status === "IN_PROGRESS" 
                              ? "text-blue-600 border-blue-500/30 bg-blue-500/5" 
                              : "text-amber-600 border-amber-500/30 bg-amber-500/5"
                          }`}
                        >
                          {t.status}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground">{t.description}</p>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/30">
                        <span>Prioridad: <strong>{t.priority}</strong></span>
                        <span>Reportado: {new Date(t.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 4. Propiedad y Reglas */}
        <TabsContent value="amenities" className="space-y-4 pt-3">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Ficha del Inmueble</CardTitle>
              <CardDescription className="text-xs">Especificaciones de la propiedad rentada</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-muted/20 border border-border/40">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Tipo de Inmueble</span>
                  <span className="font-semibold text-foreground">{activeLease.property.propertyType || "Residencial"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Comunidad / Fraccionamiento</span>
                  <span className="font-semibold text-foreground">{activeLease.property.fraccionamiento || "Independiente"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Dirección Completa</span>
                  <span className="font-semibold text-foreground">{activeLease.property.address}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Visitas Preventivas de Cuidado</span>
                  <span className="font-semibold text-foreground">Cada {activeLease.property.careVisitIntervalDays || 15} días</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
