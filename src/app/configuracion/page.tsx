import { getTenantSettings } from "@/lib/services/queries"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Settings, Building, Users, Shield, Globe, Clock, CreditCard } from "lucide-react"

export const metadata = {
  title: "Configuración | Custodia",
}

export default async function ConfiguracionPage() {
  const settings = await getTenantSettings()

  return (
    <AppShell title="Configuración" usuario={{ nombre: "Admin", rol: "Super Admin" }}>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Configuración de la Organización</h2>
          <p className="text-sm text-muted-foreground">
            Parámetros operativos, modo de gestión, membresías de equipo y estado de suscripción SaaS.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Identidad Organizacional */}
          <Card className="border-border bg-card">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Building className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">Organización Activa</CardTitle>
                  <CardDescription className="text-xs">Datos generales de la entidad</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Nombre:</span>
                <span className="font-semibold text-foreground">{settings.name}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Modo Operativo:</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {settings.operatingMode === "LANDLORD" ? "Casero Directo" : "Property Manager"}
                </Badge>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Moneda Principal:</span>
                <span className="font-mono font-medium text-foreground">{settings.currency}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Zona Horaria:</span>
                <span className="text-xs text-foreground">{settings.timezone}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground">Identificador (UUID):</span>
                <span className="font-mono text-[11px] text-muted-foreground">{settings.id}</span>
              </div>
            </CardContent>
          </Card>

          {/* Plan SaaS y Licenciamiento */}
          <Card className="border-border bg-card">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CreditCard className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">Suscripción SaaS</CardTitle>
                  <CardDescription className="text-xs">Nivel de servicio y módulos activos</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Plan Vigente:</span>
                <Badge variant="secondary" className="font-semibold text-primary">
                  {settings.subscriptionPlan}
                </Badge>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Estado de Cuenta:</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  {settings.subscriptionStatus}
                </span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Módulos Addons:</span>
                <span className="text-xs text-foreground">
                  {settings.addons.length > 0
                    ? settings.addons.map(a => a.addon).join(", ")
                    : "Mantenimiento, Bóveda, IA"}
                </span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground">Seguridad Multi-Tenant:</span>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 text-xs">
                  RLS Estricto Habilitado
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Equipo y Membresías */}
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Users className="size-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Equipo y Membresías Activas</CardTitle>
                <CardDescription className="text-xs">
                  Usuarios con acceso auditado a esta organización ({settings.members.length} miembros)
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border rounded-xl border border-border">
              {settings.members.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-3 text-sm">
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground">{member.email}</p>
                    <p className="text-xs text-muted-foreground font-mono">ID: {member.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-mono">
                      {member.role}
                    </Badge>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      {member.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
