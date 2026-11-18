import { AppShell } from "@/components/app-shell"
import { prisma } from "@/lib/prisma"
import { getSessionAndTenant } from "@/lib/services/queries"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Search, Star, ShieldCheck, MapPin } from "lucide-react"
import { Input } from "@/components/ui/input"

export const metadata = {
  title: "Directorio B2B | Custodia",
}

export default async function ProveedoresPage() {
  const { tenantId } = await getSessionAndTenant()

  // 1. Get private vendors mapped to this Tenant
  const privateVendors = await prisma.tenantVendor.findMany({
    where: { tenantId },
    include: { vendor: { include: { category: true } } }
  })

  // 2. Get global public verified vendors (Alddea network simulation)
  const publicVendors = await prisma.vendor.findMany({
    where: { 
      isPublic: true, 
      isVerified: true,
      // Exclude ones we already mapped
      id: { notIn: privateVendors.map(v => v.vendorId) }
    },
    include: { category: true }
  })

  return (
    <AppShell title="Directorio B2B" usuario={{ nombre: "Admin", rol: "Super Admin" }}>
      <div className="mx-auto max-w-7xl space-y-8">
        
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Proveedores</h1>
          <p className="text-neutral-500">
            Encuentra contratistas verificados por la red Alddea o administra tu catálogo privado.
          </p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input placeholder="Buscar plomero, pintor, empresa..." className="pl-9" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Private Vendors */}
          {privateVendors.map(({ vendor, isFavorite }) => (
            <Card key={vendor.id} className="border-border/60 bg-background/50 backdrop-blur-sm shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] dark:shadow-none hover:shadow-md transition-all overflow-hidden group">
              <div className="h-1 w-full bg-primary/80 transition-all group-hover:bg-primary" />
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg font-bold tracking-tight">{vendor.name}</CardTitle>
                    <p className="text-sm font-medium text-muted-foreground mt-0.5">{vendor.category?.name || "Servicios Generales"}</p>
                  </div>
                  {isFavorite && <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />}
                </div>
              </CardHeader>
              <CardContent className="text-sm space-y-2.5">
                <p className="text-muted-foreground"><strong className="text-foreground font-semibold">Contacto:</strong> {vendor.contactName}</p>
                <p className="text-muted-foreground"><strong className="text-foreground font-semibold">Tel:</strong> {vendor.phone}</p>
                <div className="mt-4 inline-flex items-center gap-1.5 bg-accent/50 text-foreground px-2.5 py-1 rounded-md text-xs font-semibold ring-1 ring-border/50">
                  Catálogo Privado
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Public Verified Vendors */}
          {publicVendors.map(vendor => (
            <Card key={vendor.id} className="border-border/60 bg-gradient-to-b from-background to-accent/20 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] dark:shadow-none hover:shadow-md transition-all overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                 <ShieldCheck className="w-24 h-24" />
              </div>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start relative z-10">
                  <div>
                    <CardTitle className="text-lg font-bold tracking-tight flex items-center gap-2">
                      {vendor.name}
                      <ShieldCheck className="h-4.5 w-4.5 text-primary" />
                    </CardTitle>
                    <p className="text-sm font-medium text-muted-foreground mt-0.5">{vendor.category?.name || "Servicios Generales"}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-sm space-y-2.5 relative z-10">
                <p className="text-muted-foreground"><strong className="text-foreground font-semibold">Contacto:</strong> {vendor.contactName}</p>
                <p className="text-muted-foreground"><strong className="text-foreground font-semibold">Tel:</strong> {vendor.phone}</p>
                <div className="flex items-center justify-between mt-5">
                  <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-1 rounded-md text-xs font-semibold ring-1 ring-primary/20">
                    Red Alddea (Verificado)
                  </div>
                  <div className="flex items-center gap-1.5 text-yellow-600 text-xs font-bold">
                    <Star className="h-4 w-4 fill-yellow-600" />
                    {vendor.rating.toFixed(1)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

        </div>

      </div>
    </AppShell>
  )
}
