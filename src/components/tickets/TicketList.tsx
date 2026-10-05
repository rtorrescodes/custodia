"use client"

import { useState } from "react"
import { Search, Plus, MapPin, Edit2, Trash2, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { TicketFormModal, PropertyOption } from "./TicketFormModal"
import { deleteTicket, updateTicketStatus } from "@/app/actions/ticket.actions"
import { WorkOrder } from "@/lib/types"

type TicketData = WorkOrder & {
  descripcion: string
  propiedadId: string
}

interface Props {
  initialTickets: TicketData[]
  properties: PropertyOption[]
}

const statusMap = {
  "pendiente": { label: "Pendiente", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500", icon: AlertCircle },
  "en-progreso": { label: "En Progreso", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-500", icon: Clock },
  "completada": { label: "Completada", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500", icon: CheckCircle2 },
  "cancelada": { label: "Cancelada", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500", icon: XCircle },
}

export function TicketList({ initialTickets, properties }: Props) {
  const [tickets, setTickets] = useState(initialTickets)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [isModalOpen, setIsModalOpen] = useState(false)

  const filteredTickets = tickets.filter((t) => {
    const matchesSearch = t.titulo.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          t.propiedad.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = filterStatus === "all" || t.estado === filterStatus
    return matchesSearch && matchesStatus
  })

  const handleDelete = async (id: string) => {
    if (!confirm("¿Seguro que deseas eliminar este ticket permanentemente?")) return
    try {
      const res = await deleteTicket({ id })
      if (res?.data?.success) {
        setTickets(tickets.filter(t => t.id !== id))
        window.location.reload()
      }
    } catch (e) {
      alert("Error eliminando el ticket")
    }
  }

  const handleStatusChange = async (id: string, newStatus: any) => {
    // Map internal types to Prisma types (quick hack for MVP)
    const prismaStatus = newStatus === 'pendiente' ? 'PENDING' : 
                         newStatus === 'en-progreso' ? 'IN_PROGRESS' :
                         newStatus === 'completada' ? 'COMPLETED' : 'CANCELLED'
    try {
      const res = await updateTicketStatus({ id, status: prismaStatus })
      if (res?.data?.ticket) {
        window.location.reload()
      }
    } catch(e) {
      alert("Error actualizando estado")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Mantenimiento</h1>
        <Button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#5955D1] hover:bg-[#4b47b4] text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Ticket
        </Button>
      </div>

      <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
        <CardContent className="p-0">
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="Buscar por asunto o propiedad..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              className="h-10 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5955D1]"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">Todos los Estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="en-progreso">En Progreso</option>
              <option value="completada">Completada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-neutral-200 dark:border-neutral-800">
                  <TableHead>Asunto</TableHead>
                  <TableHead>Propiedad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Asignado A</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-neutral-500">
                      No se encontraron tickets.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTickets.map((t) => {
                    const StatusIcon = statusMap[t.estado]?.icon || AlertCircle
                    return (
                      <TableRow key={t.id} className="border-neutral-200 dark:border-neutral-800">
                        <TableCell>
                          <div className="font-medium text-neutral-900 dark:text-neutral-100">
                            {t.titulo}
                          </div>
                          <div className="text-sm text-neutral-500 mt-1 max-w-[200px] truncate">
                            {t.descripcion}
                          </div>
                        </TableCell>
                        <TableCell>
                          <a href={`/propiedades/${t.propiedadId}`} className="text-[#5955D1] hover:underline flex items-center gap-1 text-sm">
                            <MapPin className="h-3 w-3" />
                            {t.propiedad}
                          </a>
                        </TableCell>
                        <TableCell>
                          <select 
                            className={`text-xs px-2 py-1 rounded-full border-0 font-medium ${statusMap[t.estado]?.color}`}
                            value={t.estado}
                            onChange={(e) => handleStatusChange(t.id, e.target.value)}
                          >
                            <option value="pendiente">Pendiente</option>
                            <option value="en-progreso">En Progreso</option>
                            <option value="completada">Completada</option>
                            <option value="cancelada">Cancelada</option>
                          </select>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-neutral-600 dark:text-neutral-400">
                            {t.asignadoA}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleDelete(t.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {isModalOpen && (
        <TicketFormModal
          properties={properties}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false)
            window.location.reload()
          }}
        />
      )}
    </div>
  )
}
