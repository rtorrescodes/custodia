import Link from "next/link"
import { Building2, CreditCard, FileText, CheckCircle2, AlertCircle } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { getRenterPortalData } from "@/lib/services/queries"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChatWidget } from "@/components/chat/ChatWidget"

export const metadata = {
  title: "Portal del Inquilino | Custodia"
}

export default async function InquilinoPage() {
  let leases: any[] = []
  
  try {
    leases = await getRenterPortalData()
  } catch (e) {
    // Handling error or missing session silently for now
  }

  const activeLease = leases.find(l => l.status === "ACTIVE" || l.status === "PENDING_SIGNATURE")

  return (
    <div className="min-h-svh bg-background selection:bg-primary/20">
      <ChatWidget />
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl shadow-[0_1px_2px_rgba(0,0,0,0.02)] dark:shadow-none">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 md:px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
              <Building2 className="size-5" />
            </div>
            <div className="leading-tight flex items-center gap-2">
              <span className="text-base font-bold text-foreground tracking-tight">Custodia</span>
              <span className="rounded-md bg-accent/60 px-2 py-0.5 text-xs font-semibold text-accent-foreground ring-1 ring-border/50">
                Portal del Inquilino
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <Avatar className="size-9 border border-border/50">
              <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">IN</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-8 flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">Bienvenido</h1>
          <p className="text-base text-muted-foreground font-medium">
            Desde aquí puedes gestionar tu contrato, pagos y comunicarte con administración.
          </p>
        </div>

        {!activeLease ? (
          <Card className="border-border/60 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] dark:shadow-none bg-background/50 backdrop-blur-sm">
            <CardContent className="py-16 flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mb-5 ring-1 ring-border/50">
                <FileText className="size-8 text-muted-foreground/60" />
              </div>
              <h3 className="text-xl font-bold text-foreground tracking-tight">No hay contratos vinculados</h3>
              <p className="text-muted-foreground max-w-sm mt-2.5 font-medium leading-relaxed">
                Actualmente no tienes ningún contrato de arrendamiento activo asociado a esta cuenta.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            
            <div className="md:col-span-2 space-y-6 lg:space-y-8">
              {activeLease.status === "PENDING_SIGNATURE" && (
                <div className="bg-yellow-50/50 dark:bg-yellow-900/10 border border-yellow-200/60 dark:border-yellow-900/40 rounded-2xl p-6 flex items-start gap-4 shadow-sm">
                  <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-500 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-bold text-yellow-900 dark:text-yellow-400 tracking-tight text-lg">Contrato Pendiente de Firma</h3>
                    <p className="text-sm font-medium text-yellow-800/80 dark:text-yellow-500/80 mt-1.5 leading-relaxed">
                      El administrador ha enviado tu contrato. Por favor, revísalo y añade un método de pago para activarlo y domiciliar tu renta.
                    </p>
                    <div className="mt-5 flex gap-3">
                      <Button className="bg-yellow-600 hover:bg-yellow-700 text-white border-0 shadow-sm transition-all active:scale-95">
                        Revisar y Firmar
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <Card className="border-border/60 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] dark:shadow-none bg-background/50 backdrop-blur-sm overflow-hidden">
                <div className="h-1 w-full bg-primary/80" />
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-bold tracking-tight">Detalles del Contrato</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4 text-sm">
                    <div className="space-y-1">
                      <span className="text-muted-foreground font-medium block">Propiedad</span>
                      <span className="font-semibold text-foreground text-base">{activeLease.property.name}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground font-medium block">Dirección</span>
                      <span className="font-semibold text-foreground text-base">{activeLease.property.address}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground font-medium block">Monto de Renta</span>
                      <span className="font-semibold text-foreground text-base">${Number(activeLease.rentAmount).toLocaleString()} {activeLease.currency}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground font-medium block">Día de Cobro</span>
                      <span className="font-semibold text-foreground text-base">Día {activeLease.paymentDay} de cada mes</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground font-medium block">Depósito en Garantía</span>
                      <span className="font-semibold text-foreground text-base">${Number(activeLease.depositAmount || 0).toLocaleString()} {activeLease.currency}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground font-medium block">Estado</span>
                      <span className="font-semibold text-foreground text-base flex items-center gap-1.5">
                        {activeLease.status === 'ACTIVE' ? <><CheckCircle2 className="h-4.5 w-4.5 text-success" /> Activo</> : 'Pendiente'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] dark:shadow-none">
                <CardHeader>
                  <CardTitle className="text-lg font-bold tracking-tight">Evidencia Fotográfica</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm font-medium text-muted-foreground mb-5 leading-relaxed">
                    Fotos anexadas al momento de entregar la propiedad, requeridas para el retorno del depósito al finalizar el contrato.
                  </div>
                  {activeLease.evidences.length === 0 ? (
                    <div className="bg-muted/30 border border-border/50 rounded-xl p-8 text-center flex items-center justify-center">
                       <span className="text-sm font-semibold text-muted-foreground">Aún no hay evidencia cargada.</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div className="aspect-video bg-muted/50 rounded-xl border border-border/50 flex items-center justify-center transition-colors hover:bg-muted/80 cursor-pointer">
                        <span className="text-xs font-semibold text-muted-foreground">Foto 1</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6 lg:space-y-8">
              <Card className="border-primary/20 bg-primary/[0.02] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] dark:shadow-none">
                <CardHeader>
                  <CardTitle className="text-primary flex items-center gap-2 tracking-tight">
                    <CreditCard className="h-5 w-5" />
                    Método de Pago
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium text-muted-foreground mb-5 leading-relaxed">
                    Mantén una tarjeta activa para domiciliación automática de renta.
                  </p>
                  
                  {activeLease.status === "ACTIVE" ? (
                    <div className="flex items-center gap-3 p-3.5 bg-background rounded-xl border border-border/60 shadow-sm">
                      <div className="h-9 w-14 bg-muted rounded flex items-center justify-center text-xs font-bold text-muted-foreground ring-1 ring-border/50">VISA</div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-foreground tracking-tight">•••• 4242</p>
                        <p className="text-xs font-medium text-muted-foreground">Expira 12/28</p>
                      </div>
                      <Button variant="ghost" size="sm" className="text-xs font-semibold hover:bg-muted/80">Editar</Button>
                    </div>
                  ) : (
                    <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm shadow-primary/20 transition-all active:scale-95 font-semibold">
                      Configurar Tarjeta
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
            
          </div>
        )}
      </main>
    </div>
  )
}
