export type Currency = "USD" | "MXN"

export type WorkOrderStatus = "pendiente" | "en-progreso" | "completada" | "cancelada"

export interface Money {
  amount: number
  currency: Currency
}

export interface WorkOrder {
  id: string
  titulo: string
  propiedad: string
  asignadoA: string
  asignadoAvatar?: string
  estado: WorkOrderStatus
  costo: Money
  fecha: string
}

export interface Kpi {
  totalPropiedades: number
  ingresosMesUSD: number
  ingresosMesMXN: number
  ordenesPendientes: number
  alertasCriticas: number
}

export interface DashboardProps {
  usuario: {
    nombre: string
    rol: string
    avatar?: string
  }
  kpis: Kpi
  ordenesRecientes: WorkOrder[]
}

export interface Copropietario {
  id: string
  nombre: string
  participacion: number // porcentaje
  avatar?: string
}

export type IntegracionEstado = "conectado" | "desconectado" | "error"

export interface Integracion {
  nombre: "Alddea" | "RAVSIS"
  estado: IntegracionEstado
  descripcion: string
}

export interface Property {
  id: string
  nombre: string
  direccion: string
  fraccionamiento: string
  descripcion: string
  fotos: string[]
  amenidades: string[]
  copropietarios: Copropietario[]
  integraciones: Integracion[]
  historial: {
    id: string
    fecha: string
    titulo: string
    detalle: string
    estado: WorkOrderStatus
  }[]
  ledger: LedgerTransaction[]
}

export type TransactionType = "ingreso" | "egreso"

export interface LedgerTransaction {
  id: string
  fecha: string
  tipo: TransactionType
  categoria: string
  descripcion: string
  monto: Money
  reciboUrl?: string
  aprobacionRequerida?: boolean
  aprobado?: boolean
}

export interface LedgerSummary {
  saldoActual: Money
  ingresosMes: Money
  egresosMes: Money
}

export interface LedgerProps {
  resumen: LedgerSummary
  transacciones: LedgerTransaction[]
  estado?: "cargando" | "vacio" | "error" | "exito"
}
