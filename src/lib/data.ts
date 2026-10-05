import type { DashboardProps, Property, LedgerProps, Currency } from "./types"

export function formatMoney(amount: number, currency: Currency) {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso))
}

export const dashboardData: DashboardProps = {
  usuario: {
    nombre: "Mariana Ríos",
    rol: "Administradora",
  },
  kpis: {
    totalPropiedades: 128,
    ingresosMesUSD: 84250.5,
    ingresosMesMXN: 1456300,
    ordenesPendientes: 17,
    alertasCriticas: 3,
  },
  ordenesRecientes: [
    {
      id: "OT-2048",
      titulo: "Fuga de agua",
      propiedad: "Villa Palmar 12",
      asignadoA: "Carlos Méndez",
      estado: "en-progreso",
      costo: { amount: 4800, currency: "MXN" },
      fecha: "2026-08-14",
    },
    {
      id: "OT-2047",
      titulo: "Mantenimiento eléctrico",
      propiedad: "Residencial Aurora 4B",
      asignadoA: "Luis Ortega",
      estado: "pendiente",
      costo: { amount: 320, currency: "USD" },
      fecha: "2026-08-13",
    },
    {
      id: "OT-2045",
      titulo: "Reparación de A/C",
      propiedad: "Torre Marena PH2",
      asignadoA: "Ana Beltrán",
      estado: "completada",
      costo: { amount: 12500, currency: "MXN" },
      fecha: "2026-08-12",
    },
    {
      id: "OT-2043",
      titulo: "Pintura de fachada",
      propiedad: "Casa Bugambilias 7",
      asignadoA: "Jorge Ramírez",
      estado: "en-progreso",
      costo: { amount: 1750, currency: "MXN" },
      fecha: "2026-08-11",
    },
    {
      id: "OT-2041",
      titulo: "Revisión de plomería",
      propiedad: "Villa Palmar 12",
      asignadoA: "Carlos Méndez",
      estado: "cancelada",
      costo: { amount: 600, currency: "USD" },
      fecha: "2026-08-10",
    },
    {
      id: "OT-2039",
      titulo: "Cambio de chapas",
      propiedad: "Condominio Del Valle 3",
      asignadoA: "Ana Beltrán",
      estado: "completada",
      costo: { amount: 2500, currency: "MXN" },
      fecha: "2026-08-09",
    },
  ],
}

export const propertyData: Property = {
  id: "PROP-0012",
  nombre: "Villa Palmar 12",
  direccion: "Av. de las Palmas 120, Zona Esmeralda",
  fraccionamiento: "Fraccionamiento Costa Esmeralda",
  descripcion:
    "Residencia de 3 niveles con acabados de lujo, vista al campo de golf y acceso privado a la zona de albercas del fraccionamiento. Administrada bajo régimen de copropiedad.",
  fotos: ["/images/prop-exterior.png", "/images/prop-sala.png", "/images/prop-alberca.png"],
  amenidades: ["Alberca privada", "Roof garden", "2 cajones de estacionamiento", "Seguridad 24/7", "Domótica", "Gimnasio"],
  copropietarios: [
    { id: "CP-1", nombre: "Roberto Salinas", participacion: 45 },
    { id: "CP-2", nombre: "Familia Herrera", participacion: 35 },
    { id: "CP-3", nombre: "Grupo Inversor MX", participacion: 20 },
  ],
  integraciones: [
    { nombre: "Alddea", estado: "conectado", descripcion: "Control de accesos y domótica" },
    { nombre: "RAVSIS", estado: "error", descripcion: "Videovigilancia y seguridad" },
  ],
  historial: [
    {
      id: "OT-2048",
      fecha: "2026-08-14",
      titulo: "Mantenimiento de bomba de alberca",
      detalle: "Reemplazo de sello mecánico y limpieza de filtros.",
      estado: "en-progreso",
    },
    {
      id: "OT-2041",
      fecha: "2026-08-10",
      titulo: "Revisión de sistema de riego",
      detalle: "Cotización cancelada por el copropietario.",
      estado: "cancelada",
    },
    {
      id: "OT-1998",
      fecha: "2026-07-22",
      titulo: "Pintura de fachada",
      detalle: "Aplicación de impermeabilizante y pintura exterior.",
      estado: "completada",
    },
  ],
  ledger: [
    {
      id: "TX-501",
      fecha: "2026-08-15",
      tipo: "ingreso",
      categoria: "Renta",
      descripcion: "Renta mensual - Inquilino Aguilar",
      monto: { amount: 3200, currency: "USD" },
      reciboUrl: "#",
    },
    {
      id: "TX-502",
      fecha: "2026-08-14",
      tipo: "egreso",
      categoria: "Mantenimiento",
      descripcion: "Bomba de alberca (OT-2048)",
      monto: { amount: 4800, currency: "MXN" },
      reciboUrl: "#",
      aprobacionRequerida: true,
      aprobado: false,
    },
    {
      id: "TX-503",
      fecha: "2026-08-10",
      tipo: "egreso",
      categoria: "Servicios",
      descripcion: "CFE - Consumo de electricidad",
      monto: { amount: 1240, currency: "MXN" },
      reciboUrl: "#",
    },
  ],
}

export const ledgerData: LedgerProps = {
  estado: "exito",
  resumen: {
    saldoActual: { amount: 42580, currency: "MXN" },
    ingresosMes: { amount: 3200, currency: "USD" },
    egresosMes: { amount: 6040, currency: "MXN" },
  },
  transacciones: [
    {
      id: "TX-601",
      fecha: "2026-08-15",
      tipo: "ingreso",
      categoria: "Renta",
      descripcion: "Renta mensual — Inquilino Aguilar",
      monto: { amount: 3200, currency: "USD" },
      reciboUrl: "#",
    },
    {
      id: "TX-602",
      fecha: "2026-08-14",
      tipo: "egreso",
      categoria: "Mantenimiento",
      descripcion: "Reparación de bomba de alberca (OT-2048)",
      monto: { amount: 4800, currency: "MXN" },
      reciboUrl: "#",
      aprobacionRequerida: true,
      aprobado: false,
    },
    {
      id: "TX-603",
      fecha: "2026-08-12",
      tipo: "egreso",
      categoria: "Servicios",
      descripcion: "CFE — Consumo de electricidad julio",
      monto: { amount: 1240, currency: "MXN" },
      reciboUrl: "#",
    },
    {
      id: "TX-604",
      fecha: "2026-08-08",
      tipo: "ingreso",
      categoria: "Depósito",
      descripcion: "Depósito en garantía — nuevo inquilino",
      monto: { amount: 800, currency: "USD" },
      reciboUrl: "#",
    },
    {
      id: "TX-605",
      fecha: "2026-08-05",
      tipo: "egreso",
      categoria: "Administración",
      descripcion: "Cuota de administración fraccionamiento",
      monto: { amount: 3500, currency: "MXN" },
      reciboUrl: "#",
      aprobacionRequerida: true,
      aprobado: true,
    },
  ],
}
