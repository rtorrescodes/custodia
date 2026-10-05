// Simple i18n implementation for MVP
export type Locale = 'es' | 'en'

export const dictionaries = {
  es: {
    portal: {
      title: "Portal del Dueño",
      statement: "Estado de cuenta",
      transparency: "Transparencia total de los movimientos de tu propiedad.",
      balance: "Saldo Actual",
      income: "Ingresos (Mes)",
      expenses: "Egresos (Mes)",
      transactions: "Últimas Transacciones",
      all: "Todas",
      pendingAuth: "Requiere Autorización",
      date: "Fecha",
      description: "Descripción",
      amount: "Monto",
      status: "Estado",
      actions: "Acciones",
      approve: "Aprobar Gasto",
      approved: "Aprobado",
      pending: "Pendiente",
      back: "Volver",
      noProperties: "No tienes propiedades asignadas.",
      selectProperty: "Selecciona una propiedad"
    }
  },
  en: {
    portal: {
      title: "Owner Portal",
      statement: "Account Statement",
      transparency: "Total transparency of your property's movements.",
      balance: "Current Balance",
      income: "Income (Month)",
      expenses: "Expenses (Month)",
      transactions: "Latest Transactions",
      all: "All",
      pendingAuth: "Requires Authorization",
      date: "Date",
      description: "Description",
      amount: "Amount",
      status: "Status",
      actions: "Actions",
      approve: "Approve Expense",
      approved: "Approved",
      pending: "Pending",
      back: "Go Back",
      noProperties: "You have no assigned properties.",
      selectProperty: "Select a property"
    }
  }
}

// Helper to get dict (in a real app, locale comes from cookies/params)
export function getDictionary(locale: Locale) {
  return dictionaries[locale]
}
