import { getWorkOrders, getProperties } from "@/lib/services/queries"
import { TicketList } from "@/components/tickets/TicketList"
import { AppShell } from "@/components/app-shell"

export const metadata = {
  title: "Mantenimiento | Custodia",
}

export default async function MantenimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [tickets, allProperties] = await Promise.all([
    getWorkOrders(),
    getProperties()
  ])

  // Extract minimal properties data for the dropdown
  const properties = allProperties.map((p: any) => ({ id: p.id, nombre: p.nombre }))

  return (
    <AppShell 
      title="Mantenimiento"
      usuario={{ nombre: "Admin", rol: "Super Admin" }}
    >
      <div className="mx-auto max-w-7xl">
        <TicketList initialTickets={tickets} properties={properties} />
      </div>
    </AppShell>
  )
}
