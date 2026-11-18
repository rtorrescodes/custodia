import { getTenantIntegrations } from "@/lib/services/queries"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Cable, ShieldCheck, CheckCircle2, AlertCircle, Key, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export const metadata = {
  title: "Integraciones | Custodia",
}

const AVAILABLE_INTEGRATIONS = [
  {
    provider: "ALDDEA",
    title: "Alddea - Control de Acceso Físico",
    description: "Sincronización de pases QR para visitantes, proveedores y control vehicular en fraccionamientos cerrados.",
    icon: ShieldCheck,
    features: ["Generación de QR para visitas", "Control perimetral", "Validación en caseta en tiempo real"],
    badge: "Seguridad Perimetral",
  },
  {
    provider: "RAVSIS",
    title: "Ravsis - Monitoreo y Botón de Pánico",
    description: "Enlace directo con central de alarmas vecinales y despacho de seguridad ante emergencias.",
    icon: Cable,
    features: ["Botón de emergencia en portal", "Despacho de patrullas", "Monitoreo 24/7"],
    badge: "Emergencias",
  },
  {
    provider: "STRIPE_CONNECT",
    title: "Stripe Connect - Pagos Digitales",
    description: "Recepción de pagos de renta vía tarjeta de crédito, débito y transferencias electrónicas SPEI.",
    icon: Key,
    features: ["Cobranza automática", "Trust accounting", "Conciliación bancaria en tiempo real"],
    badge: "Fintech",
  },
  {
    provider: "MERCADOPAGO",
    title: "Mercado Pago Gateway",
    description: "Pasarela alternativa para recepción de pagos en tiendas de conveniencia y billeteras digitales.",
    icon: ExternalLink,
    features: ["Pagos OXXO / Efectivo", "Tarjetas locales", "Recibos inmediatos"],
    badge: "Cobranza Local",
  },
]

export default async function IntegracionesPage() {
  const connected = await getTenantIntegrations()
  const connectedMap = new Map(connected.map(i => [i.provider, i]))

  return (
    <AppShell title="Integraciones" usuario={{ nombre: "Admin", rol: "Super Admin" }}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Ecosistema e Integraciones</h2>
          <p className="text-sm text-muted-foreground">
            Conecta Custodia con sistemas de control perimetral, pasarelas de pago y servicios de seguridad vecinal.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {AVAILABLE_INTEGRATIONS.map((item) => {
            const activeIntegration = connectedMap.get(item.provider)
            const isConnected = activeIntegration?.isActive ?? (item.provider === "ALDDEA") // Demo default conectado

            return (
              <Card key={item.provider} className="flex flex-col justify-between border-border bg-card">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <item.icon className="size-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold">{item.title}</CardTitle>
                        <Badge variant="secondary" className="mt-1 text-[11px]">
                          {item.badge}
                        </Badge>
                      </div>
                    </div>
                    {isConnected ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500">
                        <CheckCircle2 className="size-3.5" /> Conectado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        <AlertCircle className="size-3.5" /> No configurado
                      </span>
                    )}
                  </div>
                  <CardDescription className="pt-2 text-xs leading-relaxed">
                    {item.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="mb-2 text-xs font-medium text-foreground">Capacidades habilitadas:</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {item.features.map((f, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <span className="size-1.5 rounded-full bg-primary" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                    <span>Estado en servidor:</span>
                    <span className="font-mono text-[11px] font-semibold text-foreground">
                      {isConnected ? "Sincronizado (Zero Trust)" : "Inactivo"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
