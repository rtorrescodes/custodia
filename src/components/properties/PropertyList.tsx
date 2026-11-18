"use client"

import { useState } from "react"
import { Search, Plus, MapPin, Building, Edit2, Trash2, QrCode } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { PropertyFormModal, PropertyFormData } from "./PropertyFormModal"
import { deleteProperty, archiveProperty } from "@/app/actions/property.actions"
import { generateQrAction } from "@/app/actions/alddea.actions"
import { CsvImportModal } from "./CsvImportModal"
import { FileSpreadsheet, Archive } from "lucide-react"

type PropertyData = {
  id: string
  nombre: string
  direccion: string
  fraccionamiento: string
  alddeaId?: string | null
  managementType?: string
  cartera?: string
  ordenesActivas: number
  ingresosMesUSD: number
  creadoEn: string
}

interface Props {
  initialProperties: PropertyData[]
}

export function PropertyList({ initialProperties }: Props) {
  const [properties, setProperties] = useState(initialProperties)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterFraccionamiento, setFilterFraccionamiento] = useState("all")
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [editingProperty, setEditingProperty] = useState<PropertyFormData | null>(null)

  // Local filtering (since it's a small list MVP, otherwise we'd push to URL params)
  const filteredProperties = properties.filter((p) => {
    const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.direccion.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFracc = filterFraccionamiento === "all" || p.fraccionamiento === filterFraccionamiento
    return matchesSearch && matchesFracc
  })

  // Get unique fraccionamientos
  const fraccionamientos = Array.from(new Set(properties.map(p => p.fraccionamiento)))

  const handleArchive = async (id: string) => {
    if (!confirm("¿Deseas archivar esta unidad? Sus contratos, transacciones y órdenes se preservarán íntegros.")) return
    try {
      const res = await archiveProperty({ id })
      if (res.success) {
        setProperties(properties.filter(p => p.id !== id))
      } else {
        alert("Error al archivar: " + res.error)
      }
    } catch (e: any) {
      alert(e.message || "Error al archivar la unidad")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Seguro que deseas eliminar definitivamente este inmueble? (Solo permitido si no tiene dependencias financieras)")) return
    
    try {
      const res = await deleteProperty({ id })
      if (res?.data?.success) {
        setProperties(properties.filter(p => p.id !== id))
        window.location.reload()
      } else {
        alert(res?.error || "Bloqueo de Integridad: La propiedad contiene registros históricos que impiden su borrado destructivo.")
      }
    } catch (e: any) {
      alert(e.message || "Error eliminando la propiedad")
    }
  }

  const handleGenerateQR = async (alddeaId: string | undefined | null) => {
    if (!alddeaId) return;
    const visitorName = prompt("Ingresa el nombre del visitante para el Pase QR:");
    if (!visitorName) return;

    try {
      const res = await generateQrAction(alddeaId, visitorName);
      if (res.success) {
        alert("Pase QR generado correctamente! URL: " + res.data.passUrl);
      } else {
        alert("Error: " + res.error);
      }
    } catch (e) {
      alert("Error al intentar generar el pase QR.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Inmuebles y Unidades</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestión de unidades rentables, carteras y dependencias operativas.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setIsCsvModalOpen(true)}
            className="border-neutral-300 dark:border-neutral-700"
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Importar Lote / CSV
          </Button>
          <Button 
            onClick={() => {
              setEditingProperty(null)
              setIsModalOpen(true)
            }}
            className="bg-[#5955D1] hover:bg-[#4b47b4] text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nueva Unidad
          </Button>
        </div>
      </div>

      <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
        <CardContent className="p-0">
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="Buscar por nombre o dirección..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              className="h-10 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 dark:ring-offset-neutral-950 dark:focus-visible:ring-neutral-300"
              value={filterFraccionamiento}
              onChange={(e) => setFilterFraccionamiento(e.target.value)}
            >
              <option value="all">Todos los Fraccionamientos</option>
              {fraccionamientos.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-neutral-200 dark:border-neutral-800">
                  <TableHead>Propiedad</TableHead>
                  <TableHead>Fraccionamiento</TableHead>
                  <TableHead className="text-right">Órdenes Activas</TableHead>
                  <TableHead className="text-right">Ingresos Mes (USD)</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProperties.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-neutral-500">
                      No se encontraron propiedades.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProperties.map((p) => (
                    <TableRow key={p.id} className="border-neutral-200 dark:border-neutral-800">
                      <TableCell>
                        <div className="flex flex-col">
                          <a href={`/propiedades/${p.id}`} className="font-medium text-neutral-900 dark:text-neutral-100 hover:text-[#5955D1] hover:underline">
                            {p.nombre}
                          </a>
                          <span className="text-sm text-neutral-500 flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" /> {p.direccion}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          <Building className="mr-1 h-3 w-3" />
                          {p.fraccionamiento}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {p.ordenesActivas > 0 ? (
                          <span className="text-orange-500 font-medium">{p.ordenesActivas} pendientes</span>
                        ) : (
                          <span className="text-green-500 text-sm">Al día</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${p.ingresosMesUSD.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {p.alddeaId && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              title="Generar Pase QR (Alddea)"
                              onClick={() => handleGenerateQR(p.alddeaId)}
                            >
                              <QrCode className="h-4 w-4 text-[#5955D1]" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => {
                              setEditingProperty(p)
                              setIsModalOpen(true)
                            }}
                          >
                            <Edit2 className="h-4 w-4 text-neutral-500" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            title="Archivar Unidad (Preserva Historial)"
                            onClick={() => handleArchive(p.id)}
                          >
                            <Archive className="h-4 w-4 text-amber-500" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            title="Eliminar Inmueble (Solo sin dependencias)"
                            onClick={() => handleDelete(p.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {isModalOpen && (
        <PropertyFormModal
          property={editingProperty}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false)
            window.location.reload()
          }}
        />
      )}

      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onSuccess={() => {
          setIsCsvModalOpen(false)
          window.location.reload()
        }}
      />
    </div>
  )
}
