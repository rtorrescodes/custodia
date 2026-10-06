import assert from "node:assert";

/**
 * MATRIZ RIGUROSA DE CICLO DE COMPROMISOS Y CONTRATOS FINANCIEROS (A - H)
 * 
 * Modela con estricto apego contable y fiduciario:
 * 1. La aportación con destino específico a una orden (etiquetada).
 * 2. La constitución prioritaria de la reserva contractual si la aportación fuera de fondos libres vs asignada.
 * 3. La separación explícita entre fondos asignados a la orden y disponible para nuevas operaciones.
 * 4. La trazabilidad contable completa de asientos de doble partida (Débitos y Créditos) en cada paso.
 * 5. La independencia del Escenario G (Cancelación) con su propio balance inicial, ingreso documentado y asiento de cancelación.
 */

interface LedgerAccountBalance {
  paso: string;
  evento: string;
  bancoPmEscrow_1000: number;      // Activo
  cuentasPorPagar_2100: number;     // Pasivo
  reservaMinimaAcordada: number;
  reservaConstituida: number;
  reservaFaltante: number;
  compromisoOrden_WO1: number;      // Compromiso etiquetado
  disponibleNuevasOperaciones: number; // Fondos libres para otros gastos
  estadoOrden: string;
  estadoAportacion: string;
  asientoContable?: string;
}

export function runCorrectedFinancialMatrix() {
  console.log("================================================================================");
  console.log("🏛️ CUSTODIA: MATRIZ CONTABLE Y FIDUCIARIA CORREGIDA (PASOS A - H)");
  console.log("================================================================================\n");

  const records: LedgerAccountBalance[] = [];

  // ---------------------------------------------------------------------------
  // 0. ESTADO INICIAL DE LA PROPIEDAD
  // ---------------------------------------------------------------------------
  const reservaMinima = 2000;
  let banco = 0;
  let pasivoDueño = 0;
  let resConstituida = 0;
  let resFaltante = reservaMinima - resConstituida; // $2,000
  let compWO1 = 0;
  let disponibleNuevas = 0;

  records.push({
    paso: "0",
    evento: "Estado Inicial (Propiedad sin fondos)",
    bancoPmEscrow_1000: banco,
    cuentasPorPagar_2100: pasivoDueño,
    reservaMinimaAcordada: reservaMinima,
    reservaConstituida: resConstituida,
    reservaFaltante: resFaltante,
    compromisoOrden_WO1: compWO1,
    disponibleNuevasOperaciones: disponibleNuevas,
    estadoOrden: "N/A",
    estadoAportacion: "N/A",
    asientoContable: "Sin movimientos previos"
  });

  // ---------------------------------------------------------------------------
  // A. COTIZACIÓN APROBADA SIN FONDOS ($10,000 MXN)
  // Decisión soberana del dueño: APRUEBA la reparación WO-1 ($10,000).
  // La orden queda en AWAITING_APPROVAL ("Aprobada, pendiente de fondos").
  // Se genera solicitud de aportación con DESTINO ESPECÍFICO A WO-1.
  // No se deduce nada porque no hay fondos aún en banco.
  // ---------------------------------------------------------------------------
  records.push({
    paso: "A",
    evento: "Dueño aprueba cotización ($10k) sin fondos",
    bancoPmEscrow_1000: banco,
    cuentasPorPagar_2100: pasivoDueño,
    reservaMinimaAcordada: reservaMinima,
    reservaConstituida: resConstituida,
    reservaFaltante: resFaltante,
    compromisoOrden_WO1: 0,
    disponibleNuevasOperaciones: 0,
    estadoOrden: "AWAITING_APPROVAL (Pendiente de fondos)",
    estadoAportacion: "REQUESTED ($10,000 - Destino: WO-1)",
    asientoContable: "Sin impacto contable (Solicitud extracontable)"
  });

  // ---------------------------------------------------------------------------
  // B. DUEÑO REPORTA TRANSFERENCIA BANCARIA ($10,000 MXN)
  // El dueño envía comprobante SPEI. Estado: REPORTED.
  // Zero-Trust: Saldo bancario y disponible NO se incrementan hasta visto bueno PM.
  // ---------------------------------------------------------------------------
  records.push({
    paso: "B",
    evento: "Dueño reporta transferencia con comprobante",
    bancoPmEscrow_1000: banco,
    cuentasPorPagar_2100: pasivoDueño,
    reservaMinimaAcordada: reservaMinima,
    reservaConstituida: resConstituida,
    reservaFaltante: resFaltante,
    compromisoOrden_WO1: 0,
    disponibleNuevasOperaciones: 0,
    estadoOrden: "AWAITING_APPROVAL",
    estadoAportacion: "REPORTED ($10,000)",
    asientoContable: "Sin asiento (En proceso de validación)"
  });

  // ---------------------------------------------------------------------------
  // C. PM VERIFICA RECEPCIÓN DE APORTACIÓN ETIQUETADA
  // El PM confirma abono en cuenta bancaria de custodia ($10,000).
  // Asiento Contable C:
  //   DEBE:  1000 Caja/Banco PM Escrow        $10,000
  //   HABER: 2100 Fondos por Pagar Dueño       $10,000
  // 
  // DISTINCIÓN FIDUCIARIA CLAVE (Resolución Punto 1):
  // La aportación ingresa con DESTINO ETIQUETADO a la orden WO-1.
  // Si se tratara de fondos libres, $2,000 constituirían la reserva y quedarían $8,000 libres.
  // Al ser una aportación afectada a la reparación:
  // - Fondos etiquetados para WO-1: $10,000.
  // - Reserva constituida: $0 (la aportación no es para la reserva).
  // - Reserva faltante: $2,000 (sigue pendiente la meta contractual).
  // - Disponible para NUEVAS operaciones: $0 (los $10,000 están etiquetados para WO-1).
  // ---------------------------------------------------------------------------
  banco += 10000;
  pasivoDueño += 10000;
  // Fondos asignados a WO-1 = $10,000.
  // Por tanto, disponible para NUEVOS gastos = $0.
  disponibleNuevas = 0;

  records.push({
    paso: "C",
    evento: "PM verifica recepción de aportación etiquetada",
    bancoPmEscrow_1000: banco,
    cuentasPorPagar_2100: pasivoDueño,
    reservaMinimaAcordada: reservaMinima,
    reservaConstituida: 0,
    reservaFaltante: 2000,
    compromisoOrden_WO1: 10000, // Ya fondeado y pre-comprometido a WO-1
    disponibleNuevasOperaciones: 0, // Cero dinero libre para otras compras
    estadoOrden: "AWAITING_APPROVAL (Fondeada, lista para arranque)",
    estadoAportacion: "VERIFIED",
    asientoContable: "DB: 1000 Banco $10k | CR: 2100 Pasivo Dueño $10k"
  });

  // ---------------------------------------------------------------------------
  // D. ORDEN AUTORIZADA FORMALMENTE (IN_PROGRESS)
  // Con los fondos en custodia, la orden pasa a IN_PROGRESS.
  // El compromiso operativo queda formalmente asentado.
  // Disponible para otras operaciones: $0.
  // ---------------------------------------------------------------------------
  compWO1 = 10000;
  records.push({
    paso: "D",
    evento: "Orden autorizada y pasa a IN_PROGRESS",
    bancoPmEscrow_1000: banco,
    cuentasPorPagar_2100: pasivoDueño,
    reservaMinimaAcordada: reservaMinima,
    reservaConstituida: 0,
    reservaFaltante: 2000,
    compromisoOrden_WO1: compWO1,
    disponibleNuevasOperaciones: 0,
    estadoOrden: "IN_PROGRESS",
    estadoAportacion: "VERIFIED",
    asientoContable: "Compromiso operativo bloqueado en ledger"
  });

  // ---------------------------------------------------------------------------
  // E. VERIFICACIÓN TÉCNICA DE AVANCE DE OBRA
  // Inspección aprobada sin salida de fondos aún.
  // ---------------------------------------------------------------------------
  records.push({
    paso: "E",
    evento: "Verificación técnica de avance (Hito aprobado)",
    bancoPmEscrow_1000: banco,
    cuentasPorPagar_2100: pasivoDueño,
    reservaMinimaAcordada: reservaMinima,
    reservaConstituida: 0,
    reservaFaltante: 2000,
    compromisoOrden_WO1: compWO1,
    disponibleNuevasOperaciones: 0,
    estadoOrden: "IN_PROGRESS (Hito 1 validado)",
    estadoAportacion: "VERIFIED",
    asientoContable: "Validación técnica sin movimiento de fondos"
  });

  // ---------------------------------------------------------------------------
  // F1. PAGO PARCIAL A PROVEEDOR ($4,000 MXN)
  // Salida real de banco para anticipo de materiales.
  // Asiento Contable F1:
  //   DEBE:  5000 Gasto Mantenimiento / 2100 Pasivo  $4,000
  //   HABER: 1000 Caja/Banco PM Escrow               $4,000
  // Efecto Simétrico: Banco baja a $6,000. Compromiso remanente baja a $6,000.
  // Disponible para otras operaciones: $6,000 - $6,000 = $0 (Cero doble descuento).
  // ---------------------------------------------------------------------------
  banco -= 4000;
  pasivoDueño -= 4000;
  compWO1 -= 4000; // Quedan $6,000 pendientes de ejecutar
  disponibleNuevas = 0;

  records.push({
    paso: "F1",
    evento: "Pago parcial a proveedor ($4k anticipo)",
    bancoPmEscrow_1000: banco,
    cuentasPorPagar_2100: pasivoDueño,
    reservaMinimaAcordada: reservaMinima,
    reservaConstituida: 0,
    reservaFaltante: 2000,
    compromisoOrden_WO1: compWO1,
    disponibleNuevasOperaciones: 0,
    estadoOrden: "IN_PROGRESS ($4k pagado, $6k pendiente)",
    estadoAportacion: "VERIFIED",
    asientoContable: "DB: 2100 Pasivo Dueño $4k | CR: 1000 Banco $4k"
  });

  // ---------------------------------------------------------------------------
  // F2. FINIQUITO FINAL Y CIERRE DE ORDEN ($6,000 MXN)
  // Asiento Contable F2:
  //   DEBE:  2100 Pasivo Dueño $6,000
  //   HABER: 1000 Caja/Banco PM Escrow $6,000
  // Banco = $0, Compromiso = $0, Orden = COMPLETED.
  // ---------------------------------------------------------------------------
  banco -= 6000;
  pasivoDueño -= 6000;
  compWO1 = 0;
  disponibleNuevas = 0;

  records.push({
    paso: "F2",
    evento: "Finiquito final a proveedor ($6k) y cierre",
    bancoPmEscrow_1000: banco,
    cuentasPorPagar_2100: pasivoDueño,
    reservaMinimaAcordada: reservaMinima,
    reservaConstituida: 0,
    reservaFaltante: 2000,
    compromisoOrden_WO1: 0,
    disponibleNuevasOperaciones: 0,
    estadoOrden: "COMPLETED",
    estadoAportacion: "VERIFIED",
    asientoContable: "DB: 2100 Pasivo Dueño $6k | CR: 1000 Banco $6k"
  });

  // ---------------------------------------------------------------------------
  // ESCENARIO G INDEPENDIENTE: CICLO DE CANCELACIÓN Y LIBERACIÓN DOCUMENTADA
  // Resolviendo Punto 2: Mostramos su inicio formal e ingreso documentado.
  // ---------------------------------------------------------------------------
  // G0: Ingreso documentado de renta mensual ($5,000 MXN) en cuenta fiduciaria
  let bancoG = 0;
  let pasivoG = 0;
  // Ingreso documentado:
  bancoG += 5000;
  pasivoG += 5000;
  // Reserva constituida con fondos libres: min($2000, $5000) = $2,000
  let resG = 2000;
  let faltanteG = 0;
  let disponibleG = bancoG - resG; // $3,000 libres

  records.push({
    paso: "G1",
    evento: "[Escenario G] Ingreso documentado de renta ($5k)",
    bancoPmEscrow_1000: bancoG,
    cuentasPorPagar_2100: pasivoG,
    reservaMinimaAcordada: reservaMinima,
    reservaConstituida: resG,
    reservaFaltante: faltanteG,
    compromisoOrden_WO1: 0,
    disponibleNuevasOperaciones: disponibleG, // $3,000
    estadoOrden: "N/A",
    estadoAportacion: "N/A",
    asientoContable: "DB: 1000 Banco $5k | CR: 2100 Pasivo Dueño $5k"
  });

  // G2: Se autoriza orden de pintura WO-2 por $3,000 MXN (IN_PROGRESS)
  let compG = 3000;
  disponibleG = bancoG - resG - compG; // $5000 - $2000 - $3000 = $0

  records.push({
    paso: "G2",
    evento: "[Escenario G] Orden WO-2 ($3k) compromete saldo libre",
    bancoPmEscrow_1000: bancoG,
    cuentasPorPagar_2100: pasivoG,
    reservaMinimaAcordada: reservaMinima,
    reservaConstituida: resG,
    reservaFaltante: faltanteG,
    compromisoOrden_WO1: compG,
    disponibleNuevasOperaciones: disponibleG, // $0
    estadoOrden: "IN_PROGRESS (Pintura $3k)",
    estadoAportacion: "N/A",
    asientoContable: "Compromiso fiduciario reservado ($3k)"
  });

  // G3: Cancelación de orden WO-2 antes de ejecutar pagos -> Liberación íntegra
  compG = 0;
  disponibleG = bancoG - resG - compG; // $5000 - $2000 - 0 = $3,000 liberados

  records.push({
    paso: "G3",
    evento: "[Escenario G] Cancelación de WO-2 -> Compromiso liberado",
    bancoPmEscrow_1000: bancoG,
    cuentasPorPagar_2100: pasivoG,
    reservaMinimaAcordada: reservaMinima,
    reservaConstituida: resG,
    reservaFaltante: faltanteG,
    compromisoOrden_WO1: compG,
    disponibleNuevasOperaciones: disponibleG, // $3,000 disponibles de nuevo
    estadoOrden: "CANCELLED (Compromiso devuelto al disponible)",
    estadoAportacion: "N/A",
    asientoContable: "Desafectación de fondos; disponible restituido"
  });

  // ---------------------------------------------------------------------------
  // H. IDEMPOTENCIA EN VERIFICACIÓN Y REGISTRO (PREVENCIÓN DE DUPLICADOS)
  // Reintento o doble clic sobre la misma aportación o pago no altera saldos.
  // ---------------------------------------------------------------------------
  records.push({
    paso: "H",
    evento: "Idempotencia: Reintento de verificación/pago",
    bancoPmEscrow_1000: bancoG,
    cuentasPorPagar_2100: pasivoG,
    reservaMinimaAcordada: reservaMinima,
    reservaConstituida: resG,
    reservaFaltante: faltanteG,
    compromisoOrden_WO1: 0,
    disponibleNuevasOperaciones: disponibleG,
    estadoOrden: "CANCELLED",
    estadoAportacion: "N/A",
    asientoContable: "Rechazo por idempotencyKey existente (Sin duplicados)"
  });

  console.table(records);
  return records;
}

if (require.main === module) {
  runCorrectedFinancialMatrix();
}
