import { getProperties } from "@/lib/services/queries"
import { PropertyList } from "@/components/properties/PropertyList"
import { AppShell } from "@/components/app-shell"

export const metadata = {
  title: "Propiedades | Custodia",
}

export default async function PropiedadesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const properties = await getProperties()

  return (
    <AppShell 
      title="Propiedades"
      usuario={{ nombre: "Admin", rol: "Super Admin" }}
    >
      <div className="mx-auto max-w-7xl">
        <PropertyList initialProperties={properties} />
      </div>
    </AppShell>
  )
}
