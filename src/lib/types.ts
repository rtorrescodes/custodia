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

export interface FiduciarySummaryData {
  custodiaPmEfectiva: number
  depositosGarantiaRetenidos: number
  fondosNetosDueño: number
  reservaMinima: number
  reservaConstituida: number
  reservaFaltante: number
  compromisosVigentes: number
  disponibleNuevasObligaciones: number
  deficitReal: number
  esDeficitario: boolean
}

export interface PendingQuoteData {
  id: string
  version: number
  workOrderId: string
  titulo: string
  descripcion?: string
  costoTotal: number
  costoManoObra: number
  costoMateriales: number
  partidas?: any
  notas?: string
  fecha: string
}

export interface OwnerContributionData {
  id: string
  monto: number
  moneda: string
  motivo: string
  estado: string
  solicitadoEn: string
  reportadoEn?: string | null
  verificadoEn?: string | null
  disponibleEn?: string | null
  comprobanteUrl?: string | null
  notas?: string | null
}

export interface LedgerSummary {
  saldoActual: Money
  ingresosMes: Money
  egresosMes: Money
  fiduciario?: FiduciarySummaryData | null
}

export interface LedgerProps {
  resumen: LedgerSummary
  transacciones: LedgerTransaction[]
  cotizacionesPendientes?: PendingQuoteData[]
  aportacionesFondos?: OwnerContributionData[]
  estado?: "cargando" | "vacio" | "error" | "exito"
}
