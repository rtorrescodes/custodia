import { getLeases, getProperties } from "@/lib/services/queries"
import { LeaseList } from "@/components/rentas/LeaseList"
import { AppShell } from "@/components/app-shell"

export const metadata = {
  title: "Rentas | Custodia",
}

export default async function RentasPage() {
  const [leases, allProperties] = await Promise.all([
    getLeases(),
    getProperties()
  ])

  // Extract minimal properties data for the dropdown
  const properties = allProperties.map(p => ({ id: p.id, nombre: p.nombre }))

  return (
    <AppShell 
      title="Rentas"
      usuario={{ nombre: "Admin", rol: "Super Admin" }}
    >
      <div className="mx-auto max-w-7xl">
        <LeaseList initialLeases={leases} properties={properties} />
      </div>
    </AppShell>
  )
}
