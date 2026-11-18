import Link from "next/link"
import { Building2 } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { getRenterPortalData } from "@/lib/services/queries"
import { ChatWidget } from "@/components/chat/ChatWidget"
import { RenterPortalView } from "@/components/inquilino/RenterPortalView"

export const metadata = {
  title: "Portal del Inquilino | Custodia"
}

export default async function InquilinoPage() {
  let portalData: any = { leases: [], maintenanceTickets: [], user: null }
  
  try {
    portalData = await getRenterPortalData()
  } catch (e) {
    // Handling error or missing session silently for now
  }

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
              <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
                {portalData.user?.name?.slice(0, 2).toUpperCase() || "IN"}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Hola, {portalData.user?.name || "Inquilino"}
          </h1>
          <p className="text-sm text-muted-foreground font-medium">
            Gestiona tu contrato de arrendamiento, reporta tus pagos por transferencia y solicita reparaciones directamente a tu casero.
          </p>
        </div>

        <RenterPortalView initialData={portalData} />
      </main>
    </div>
  )
}

