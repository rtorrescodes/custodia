import assert from "node:assert";
import dotenv from "dotenv";
dotenv.config();
import { prisma, withTenantRLS } from "../src/lib/prisma";
import { accountingService } from "../src/lib/services/accounting-service";
import { propertyOperationsService } from "../src/lib/services/property-operations.service";
import { Prisma } from "../src/generated/prisma/client";

/**
 * SUITE DE INTEGRACIÓN Y PERSISTENCIA REAL: CICLO FINANCIERO CUSTODIA (PASOS A - H)
 * 
 * Invoca directamente la implementación compartida de negocio (propertyOperationsService)
 * ejecutando sobre PostgreSQL de desarrollo con transacciones reales y bloqueo pesimista:
 * - Afectación inequívoca a WorkOrder en base de datos.
 * - Comprobación de asientos de partida doble en JournalEntry y JournalLine.
 * - Idempotencia transaccional.
 * - Verificación de discrepancia: Solicitado $6,500 vs Confirmado $5,000 asienta exactamente $5,000.
 * - Ciclo de cancelación con desafectación fiduciaria real.
 * - Saldo libre inicial de $5,000 para demostrar que las fórmulas fiduciarias no realizan doble descuento.
 */
async function runPersistentFinancialCycleSuite() {
  console.log("================================================================================");
  console.log("🏛️ CUSTODIA: SUITE DE PERSISTENCIA Y CICLO FINANCIERO EN POSTGRESQL REAL");
  console.log("================================================================================\n");

  const TENANT_ID = "63ba31f2-cf6a-4f05-a8f7-06393d6222a8";
  const PROPERTY_ID = "f28e8fa3-63e8-4113-b620-0cf181e2363c"; // Villa Serena Residencial
  const PM_USER_ID = "56a59979-7074-4615-bd34-dfd0a56fd81e";
  const OWNER_USER_ID = "41d2bb0d-42d5-4839-afd3-2630e6c7c132";

  let testWorkOrderId: string | null = null;
  let testQuoteId: string | null = null;
  let testContributionId: string | null = null;
  let setupEscrowEntryId: string | null = null;
  let refPartial = "";
  let refFinal = "";

  try {
    // ---------------------------------------------------------------------------
    // 0. BALANCE INICIAL Y ASEGURAMIENTO DE SALDO LIBRE INICIAL ($5,000 MXN)
    // ---------------------------------------------------------------------------
    console.log("Paso 0: Consultando balance fiduciario inicial de Villa Serena...");
    const accounts = await accountingService.ensureStandardChartOfAccounts(TENANT_ID);
    
    // Inyectamos $5,000 de saldo fiduciario libre del dueño para comprobar no-superposición
    const initialEntry = await accountingService.postEntry({
      tenantId: TENANT_ID,
      idempotencyKey: `test-free-funds-setup-${Date.now()}`,
      effectiveDate: new Date(),
      description: "Aportación de fondos libres para validación fiduciaria de no-superposición",
      createdById: PM_USER_ID,
      lines: [
        {
          accountId: accounts.cashPmEscrow,
          debit: 5000,
          credit: 0,
          currency: "MXN",
          propertyId: PROPERTY_ID,
          ownerId: OWNER_USER_ID,
        },
        {
          accountId: accounts.ownerFundsPayable,
          debit: 0,
          credit: 5000,
          currency: "MXN",
          propertyId: PROPERTY_ID,
          ownerId: OWNER_USER_ID,
        }
      ]
    });
    setupEscrowEntryId = initialEntry.id;

    const initialSummary = await accountingService.getPropertyFiduciarySummary(TENANT_ID, PROPERTY_ID);
    console.log("Resumen inicial tras inyección de $5,000 libres:", {
      custodiaPm: initialSummary.custodiaPmEfectiva,
      reservaMinima: initialSummary.reservaMinimaContractual,
      reservaConstituida: initialSummary.reservaConstituida,
      reservaFaltante: initialSummary.reservaFaltante,
      disponibleNuevas: initialSummary.disponibleNuevasObligaciones
    });

    // Con $5,000 libres y reserva mínima de $2,000:
    // reservaConstituida debe ser $2,000, reservaFaltante $0, disponible $3,000
    assert.strictEqual(initialSummary.reservaConstituida, 2000, "Reserva debe quedar constituida por $2,000");
    assert.strictEqual(initialSummary.reservaFaltante, 0, "Reserva faltante debe ser $0");
    assert.ok(initialSummary.disponibleNuevasObligaciones >= 3000, "Debe haber al menos $3,000 disponibles para nuevas obligaciones");

    // ---------------------------------------------------------------------------
    // A. CREAR ORDEN Y APROBAR COTIZACIÓN CON FONDOS INSUFICIENTES
    // Costo de orden = fondos disponibles + $7,000 (Déficit de $7,000 a fondear)
    // ---------------------------------------------------------------------------
    const currentAvailable = initialSummary.disponibleNuevasObligaciones;
    const requiredOrderCost = currentAvailable + 7000;
    const labor = Math.floor(requiredOrderCost * 0.6);
    const material = requiredOrderCost - labor;

    console.log(`\nPaso A: Creando orden por $${requiredOrderCost} MXN (disponible actual: $${currentAvailable} MXN, faltan $7,000)...`);
    const wo = await prisma.workOrder.create({
      data: {
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        reporterId: PM_USER_ID,
        title: "Impermeabilización Techo Suite Real",
        description: "Trabajo mayor con cotización formal",
        category: "MAINTENANCE",
        priority: "HIGH",
        status: "AWAITING_APPROVAL",
        estimatedCost: new Prisma.Decimal(requiredOrderCost)
      }
    });
    testWorkOrderId = wo.id;

    const quote = await prisma.workOrderQuote.create({
      data: {
        tenantId: TENANT_ID,
        workOrderId: wo.id,
        version: 1,
        laborCost: new Prisma.Decimal(labor),
        materialCost: new Prisma.Decimal(material),
        totalCost: new Prisma.Decimal(requiredOrderCost),
        status: "SUBMITTED",
        itemsJson: [
          { description: "Mano de obra especializada", amount: labor },
          { description: "Impermeabilizante y membrana", amount: material }
        ]
      }
    });
    testQuoteId = quote.id;

    // Llamada al SERVICIO REAL COMPARTIDO
    const approvalRes = await propertyOperationsService.approveQuote(
      TENANT_ID,
      OWNER_USER_ID,
      { quoteId: quote.id, expectedVersion: 1, reason: "Aprobación formal por propietario" }
    );

    console.log("✅ Paso A verificado en PostgreSQL (vía Servicio Compartido):", approvalRes);
    assert.strictEqual(approvalRes.approved, true);
    assert.strictEqual(approvalRes.hasSufficientFunds, false, "No debe tener fondos suficientes");
    assert.strictEqual(approvalRes.readyToStart, false);
    assert.ok(approvalRes.deficitAmount > 0, "Debe calcular déficit fiduciario");
    assert.ok(approvalRes.linkedContributionId, "Debe generar o ligar solicitud de aportación");

    testContributionId = approvalRes.linkedContributionId;

    // Verificar en BD
    const dbWoAfterA = await prisma.workOrder.findUnique({ where: { id: wo.id } });
    assert.strictEqual(dbWoAfterA?.status, "AWAITING_APPROVAL", "Orden debe quedar AWAITING_APPROVAL por falta de fondos");

    // ---------------------------------------------------------------------------
    // B. PROPIETARIO REPORTA TRANSFERENCIA CON COMPROBANTE Y REFERENCIA
    // Invocando el servicio real compartido (mismo que invoca reportOwnerContributionAction)
    // ---------------------------------------------------------------------------
    console.log("\nPaso B: Propietario reporta transferencia bancaria con monto parcial de $5,000 MXN vía servicio real...");
    const dummyPdfBuffer = Buffer.from("%PDF-1.4 Comprobante bancario real SPEI " + Date.now());

    const reportedRes = await propertyOperationsService.reportOwnerContribution(
      TENANT_ID,
      OWNER_USER_ID,
      {
        contributionId: testContributionId!,
        reference: "SPEI-BBVA-PARTIAL-001",
        transferDate: new Date().toISOString().split("T")[0],
        reportedAmount: 5000,
        notes: "Reporte parcial de $5,000 con SPEI adjunto",
        fileBuffer: dummyPdfBuffer,
        fileName: "comprobante_spei_5000.pdf",
        fileMimeType: "application/pdf"
      }
    );

    console.log("✅ Paso B verificado en PostgreSQL (vía Servicio Compartido):", reportedRes);
    assert.strictEqual(reportedRes.status, "REPORTED");
    assert.strictEqual(reportedRes.reportedAmount, 5000);
    assert.strictEqual(reportedRes.discrepancy, true);
    assert.strictEqual(reportedRes.verified, false, "Cero liberación antes de verificación");
    assert.ok(reportedRes.evidenceUrl?.startsWith(TENANT_ID), "Evidencia debe guardarse en ruta de tenant válida");

    // Saldo bancario fiduciario NO debe haber cambiado
    const summaryAtB = await accountingService.getPropertyFiduciarySummary(TENANT_ID, PROPERTY_ID);
    assert.strictEqual(summaryAtB.custodiaPmEfectiva, initialSummary.custodiaPmEfectiva, "Cero liberación antes de verificación");

    // ---------------------------------------------------------------------------
    // C. PM VERIFICA RECEPCIÓN DE FONDOS VÍA propertyOperationsService.verifyOwnerContribution
    // Confirmando exactamente $5,000 recibidos en banco.
    // Comprobamos que el asiento de partida doble registra EXACTAMENTE los $5,000 confirmados.
    // ---------------------------------------------------------------------------
    console.log("\nPaso C: PM verifica recepción de $5,000 vía propertyOperationsService.verifyOwnerContribution...");
    const verifyRes = await propertyOperationsService.verifyOwnerContribution(
      TENANT_ID,
      PM_USER_ID,
      {
        contributionId: testContributionId!,
        verifiedAmount: 5000,
        notes: "Acreditación bancaria verificada por PM en extracto BBVA"
      }
    );

    console.log("✅ Paso C verificado en PostgreSQL (vía Servicio Compartido):", verifyRes);
    assert.strictEqual(verifyRes.status, "VERIFIED");
    assert.strictEqual(verifyRes.releasedAmount, 5000);

    // Inspeccionar asiento contable exacto generado en PostgreSQL
    const entryInDb = await prisma.journalEntry.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: TENANT_ID,
          idempotencyKey: `owner-contrib-${testContributionId}`
        }
      },
      include: { lines: true }
    });

    assert.ok(entryInDb, "Debe existir asiento contable para la aportación verificada");
    assert.strictEqual(entryInDb.lines.length, 2);
    const debitLine = entryInDb.lines.find(l => Number(l.debit) > 0);
    const creditLine = entryInDb.lines.find(l => Number(l.credit) > 0);
    assert.strictEqual(Number(debitLine?.debit), 5000, "Débito bancario debe ser exactamente $5,000");
    assert.strictEqual(Number(creditLine?.credit), 5000, "Crédito a pasivo debe ser exactamente $5,000");
    console.log("🎯 VERIFICADO: El asiento contable registró exactamente los $5,000 confirmados, sin alterar la solicitud original.");

    // COMPROBACIÓN FIDUCIARIA CLAVE EN C:
    // Los $5,000 verificados están etiquetados para esta orden (earmarked).
    // NO deben inflar el disponible general para otras operaciones ni duplicarse en la reserva.
    const summaryAtC = await accountingService.getPropertyFiduciarySummary(TENANT_ID, PROPERTY_ID);
    console.log("Resumen fiduciario tras verificación en Paso C:", {
      custodiaPm: summaryAtC.custodiaPmEfectiva,
      reservaConstituida: summaryAtC.reservaConstituida,
      reservaFaltante: summaryAtC.reservaFaltante,
      disponibleNuevas: summaryAtC.disponibleNuevasObligaciones
    });

    assert.strictEqual(summaryAtC.custodiaPmEfectiva, initialSummary.custodiaPmEfectiva + 5000);
    // Como los $5,000 están etiquetados a la orden que sigue en AWAITING_APPROVAL, no aumentan disponibleNuevas
    assert.strictEqual(summaryAtC.disponibleNuevasObligaciones, initialSummary.disponibleNuevasObligaciones);
    assert.strictEqual(summaryAtC.reservaConstituida, 2000);

    // ---------------------------------------------------------------------------
    // D. REVISIÓN DE APROBACIÓN: CON LOS NUEVOS FONDOS ($5,000 + $3,000 libres = $8,000 < $10,000)
    // Aportamos los $2,000 faltantes para completar $10,000 y autorizar arranque
    // ---------------------------------------------------------------------------
    console.log("\nPaso D: Acreditando los $2,000 faltantes para completar los $10,000...");
    const extraEntry = await accountingService.postEntry({
      tenantId: TENANT_ID,
      idempotencyKey: `test-extra-funding-${Date.now()}`,
      effectiveDate: new Date(),
      description: "Aportación de complemento para orden de impermeabilización",
      createdById: PM_USER_ID,
      lines: [
        {
          accountId: accounts.cashPmEscrow,
          debit: 2000,
          credit: 0,
          currency: "MXN",
          propertyId: PROPERTY_ID,
          ownerId: OWNER_USER_ID,
        },
        {
          accountId: accounts.ownerFundsPayable,
          debit: 0,
          credit: 2000,
          currency: "MXN",
          propertyId: PROPERTY_ID,
          ownerId: OWNER_USER_ID,
        }
      ]
    });

    // Ahora pasamos la orden a IN_PROGRESS formalmente vía el servicio startWorkOrder con validación fiduciaria
    const startRes = await propertyOperationsService.startWorkOrder(
      TENANT_ID,
      PM_USER_ID,
      { workOrderId: testWorkOrderId!, notes: "Arranque de obra autorizado tras fondeo total" }
    );
    console.log("✅ Paso D: Orden iniciada formalmente vía startWorkOrder:", startRes);
    assert.strictEqual(startRes.status, "IN_PROGRESS");

    const summaryAtD = await accountingService.getPropertyFiduciarySummary(TENANT_ID, PROPERTY_ID);
    console.log("✅ Paso D: Orden en IN_PROGRESS:", {
      custodiaPm: summaryAtD.custodiaPmEfectiva,
      compromisosVigentes: summaryAtD.compromisosVigentes,
      reservaConstituida: summaryAtD.reservaConstituida,
      disponibleNuevas: summaryAtD.disponibleNuevasObligaciones
    });

    assert.strictEqual(
      summaryAtD.compromisosVigentes,
      initialSummary.compromisosVigentes + requiredOrderCost,
      `Compromiso de orden debe incrementar en $${requiredOrderCost}`
    );

    // ---------------------------------------------------------------------------
    // E & F. PAGO PARCIAL Y FINIQUITO VÍA propertyOperationsService.recordVendorPayment
    // ---------------------------------------------------------------------------
    const runUid = Date.now().toString().slice(-6);
    refPartial = `SPEI-PROV-MAT-${runUid}`;
    refFinal = `SPEI-PROV-FIN-${runUid}`;

    const pay1Amount = Math.floor(requiredOrderCost * 0.4);
    const pay2Amount = requiredOrderCost - pay1Amount;
    console.log(`\nPaso F1: Registrando pago parcial a proveedor ($${pay1Amount} MXN) vía servicio real...`);
    const payRes1 = await propertyOperationsService.recordVendorPayment(
      TENANT_ID,
      PM_USER_ID,
      {
        workOrderId: testWorkOrderId!,
        amount: pay1Amount,
        isFinalPayment: false,
        reference: refPartial,
        notes: "Anticipo de compra de impermeabilizante"
      }
    );

    console.log("✅ Paso F1 verificado:", payRes1);
    assert.strictEqual(payRes1.paidAmount, pay1Amount);
    assert.strictEqual(payRes1.status, "IN_PROGRESS");
    assert.strictEqual(payRes1.isCompleted, false);

    const summaryAtF1 = await accountingService.getPropertyFiduciarySummary(TENANT_ID, PROPERTY_ID);
    console.log(`Resumen tras pago parcial de $${pay1Amount}:`, {
      custodiaPm: summaryAtF1.custodiaPmEfectiva,
      compromisosVigentes: summaryAtF1.compromisosVigentes,
      reservaConstituida: summaryAtF1.reservaConstituida,
      disponibleNuevas: summaryAtF1.disponibleNuevasObligaciones
    });

    assert.strictEqual(
      summaryAtF1.compromisosVigentes,
      initialSummary.compromisosVigentes + pay2Amount,
      `Compromiso remanente debe ser baseline + $${pay2Amount}`
    );

    console.log(`\nPaso F2: Finiquito final a proveedor ($${pay2Amount} MXN) vía servicio real...`);
    const payRes2 = await propertyOperationsService.recordVendorPayment(
      TENANT_ID,
      PM_USER_ID,
      {
        workOrderId: testWorkOrderId!,
        amount: pay2Amount,
        isFinalPayment: true,
        reference: refFinal,
        notes: "Liquidación final por terminación de obra"
      }
    );

    console.log("✅ Paso F2 verificado:", payRes2);
    assert.strictEqual(payRes2.paidAmount, pay2Amount);
    assert.strictEqual(payRes2.status, "COMPLETED");
    assert.strictEqual(payRes2.isCompleted, true);

    const summaryAtF2 = await accountingService.getPropertyFiduciarySummary(TENANT_ID, PROPERTY_ID);
    console.log("Resumen tras finiquito F2:", {
      custodiaPm: summaryAtF2.custodiaPmEfectiva,
      compromisosVigentes: summaryAtF2.compromisosVigentes,
      reservaConstituida: summaryAtF2.reservaConstituida,
      disponibleNuevas: summaryAtF2.disponibleNuevasObligaciones
    });

    assert.strictEqual(
      summaryAtF2.compromisosVigentes,
      initialSummary.compromisosVigentes,
      "Compromisos deben retornar al nivel baseline"
    );

    // ---------------------------------------------------------------------------
    // G. ESCENARIO G INDEPENDIENTE VÍA propertyOperationsService.cancelWorkOrder
    // ---------------------------------------------------------------------------
    console.log("\nPaso G: Demostrando cancelación y desafectación vía cancelWorkOrder...");
    const woCancel = await prisma.workOrder.create({
      data: {
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        reporterId: PM_USER_ID,
        title: "Pintura Fachada Escenario G",
        description: "Trabajo cancelable",
        status: "AWAITING_APPROVAL",
        estimatedCost: new Prisma.Decimal(3000)
      }
    });

    const contribCancel = await prisma.ownerContribution.create({
      data: {
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        ownerId: OWNER_USER_ID,
        workOrderId: woCancel.id,
        amount: new Prisma.Decimal(3000),
        status: "REQUESTED",
        reason: "Fondeo para pintura fachada G"
      }
    });

    const cancelRes = await propertyOperationsService.cancelWorkOrder(
      TENANT_ID,
      PM_USER_ID,
      {
        workOrderId: woCancel.id,
        cancellationReason: "Propietario decide posponer la pintura hasta primavera"
      }
    );

    console.log("✅ Paso G verificado en PostgreSQL (vía Servicio Compartido):", cancelRes);
    assert.strictEqual(cancelRes.status, "CANCELLED");
    assert.strictEqual(cancelRes.releasedFunds, true);

    const dbWoCancel = await prisma.workOrder.findUnique({ where: { id: woCancel.id } });
    const dbContribCancel = await prisma.ownerContribution.findUnique({ where: { id: contribCancel.id } });
    assert.strictEqual(dbWoCancel?.status, "CANCELLED");
    assert.strictEqual(dbContribCancel?.status, "CANCELLED");

    await prisma.ownerContribution.delete({ where: { id: contribCancel.id } });
    await prisma.workOrder.delete({ where: { id: woCancel.id } });

    // ---------------------------------------------------------------------------
    // H. IDEMPOTENCIA CONTABLE Y PREVENCIÓN DE DUPLICADOS EN BD
    // ---------------------------------------------------------------------------
    console.log("\nPaso H: Comprobando idempotencia contable contra duplicados...");
    const duplicateKey = `owner-contrib-${testContributionId}`;
    
    const duplicateEntry = await accountingService.postEntry({
      tenantId: TENANT_ID,
      idempotencyKey: duplicateKey,
      effectiveDate: new Date(),
      description: "Intento duplicado de acreditación",
      createdById: PM_USER_ID,
      lines: [
        {
          accountId: accounts.cashPmEscrow,
          debit: 5000,
          credit: 0,
          currency: "MXN",
          propertyId: PROPERTY_ID,
          ownerId: OWNER_USER_ID
        },
        {
          accountId: accounts.ownerFundsPayable,
          debit: 0,
          credit: 5000,
          currency: "MXN",
          propertyId: PROPERTY_ID,
          ownerId: OWNER_USER_ID
        }
      ]
    });

    assert.strictEqual(duplicateEntry.id, entryInDb.id, "Debe retornar la entrada existente");
    const countEntries = await prisma.journalEntry.count({
      where: {
        tenantId: TENANT_ID,
        idempotencyKey: duplicateKey
      }
    });
    assert.strictEqual(countEntries, 1, "Solo debe existir un registro con esa idempotencyKey");
    console.log("✅ Paso H verificado: Idempotencia persistente en base de datos previene duplicaciones.");

    // Paso H2: Comprobar deduplicación conjunta en recordVendorPayment por clave estable y workOrderId
    console.log("\nPaso H2: Probando reintento de pago a proveedor con misma referencia (idempotencia en recordVendorPayment)...");
    const duplicateVendorPay = await propertyOperationsService.recordVendorPayment(
      TENANT_ID,
      PM_USER_ID,
      {
        workOrderId: testWorkOrderId!,
        amount: pay1Amount,
        isFinalPayment: false,
        reference: refPartial,
      }
    );
    assert.strictEqual(duplicateVendorPay.idempotentSkip, true, "El reintento con misma referencia debe detectarse como idempotente");
    assert.strictEqual(duplicateVendorPay.paidAmount, pay1Amount, "Monto pagado reportado debe ser idéntico");
    assert.ok(duplicateVendorPay.transactionId, "Debe retornar el transactionId real original");
    console.log("✅ Paso H2 verificado: Reintento devolvió transactionId original y no duplicó transacción ni asiento.");

    // Paso H2b: Probar que si el título de la orden cambia, el reintento de pago se sigue reconociendo por la clave estable
    console.log("\nPaso H2b: Cambiando título de la orden para comprobar que la clave estable no depende del título...");
    await prisma.workOrder.update({
      where: { id: testWorkOrderId! },
      data: { title: "Impermeabilización Techo Suite Real (MODIFICADO POR PM)" }
    });
    const reattemptAfterTitleChange = await propertyOperationsService.recordVendorPayment(
      TENANT_ID,
      PM_USER_ID,
      {
        workOrderId: testWorkOrderId!,
        amount: pay1Amount,
        isFinalPayment: false,
        reference: refPartial,
      }
    );
    assert.strictEqual(reattemptAfterTitleChange.idempotentSkip, true, "Debe seguir siendo idempotente aun con título modificado");
    console.log("✅ Paso H2b verificado: Clave estable inmune a cambios de título de la orden.");

    // Paso H2c: Probar que dos órdenes distintas con el mismo título y la misma referencia NO se confunden
    console.log("\nPaso H2c: Creando segunda orden con mismo título y probando pago con misma referencia de texto...");
    const woTwin = await prisma.workOrder.create({
      data: {
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        reporterId: PM_USER_ID,
        title: "Impermeabilización Techo Suite Real (MODIFICADO POR PM)",
        description: "Orden gemela en otra suite",
        status: "IN_PROGRESS",
        estimatedCost: new Prisma.Decimal(2000),
      }
    });

    const payTwin = await propertyOperationsService.recordVendorPayment(
      TENANT_ID,
      PM_USER_ID,
      {
        workOrderId: woTwin.id,
        amount: 1000,
        isFinalPayment: false,
        reference: refPartial, // Misma referencia pero para woTwin
      }
    );
    assert.strictEqual(payTwin.workOrderId, woTwin.id);
    assert.strictEqual(payTwin.idempotentSkip, undefined); // No es skip, es un pago legítimo de la otra orden
    assert.notStrictEqual(payTwin.transactionId, duplicateVendorPay.transactionId);
    console.log("✅ Paso H2c verificado: Dos órdenes distintas no se confunden aunque compartan título y referencia.");

    // Limpieza de woTwin
    await prisma.transaction.deleteMany({ where: { workOrderId: woTwin.id } });
    await prisma.journalLine.deleteMany({
      where: { entry: { idempotencyKey: `vendor-pay-wo-${woTwin.id}-${refPartial}` } }
    });
    await prisma.journalEntry.deleteMany({
      where: { idempotencyKey: `vendor-pay-wo-${woTwin.id}-${refPartial}` }
    });
    await prisma.workOrder.delete({ where: { id: woTwin.id } });

    // Paso H2d: Probar rechazo ante misma clave con importe diferente
    console.log("\nPaso H2d: Probando rechazo de misma clave con importe discrepante...");
    let conflictCaught = false;
    try {
      await propertyOperationsService.recordVendorPayment(
        TENANT_ID,
        PM_USER_ID,
        {
          workOrderId: testWorkOrderId!,
          amount: pay1Amount + 1000, // diferente monto
          isFinalPayment: false,
          reference: refPartial,
        }
      );
    } catch (e: any) {
      if (e.message.includes("Conflicto de idempotencia")) {
        conflictCaught = true;
      }
    }
    assert.strictEqual(conflictCaught, true, "Debe rechazar con error si la referencia ya existe con diferente monto");
    console.log("✅ Paso H2d verificado: Conflicto de importe en misma clave estable rechazado correctamente.");

    // Paso H3: Probar reaprobación idempotente de cotización (approveQuote)
    console.log("\nPaso H3: Probando reaprobación de cotización ya aprobada...");
    const reapproveRes = await propertyOperationsService.approveQuote(
      TENANT_ID,
      OWNER_USER_ID,
      { quoteId: testQuoteId!, expectedVersion: 1 }
    );
    assert.strictEqual(reapproveRes.idempotentSkip, true, "Reaprobar misma versión debe retornar idempotentSkip");
    assert.strictEqual(reapproveRes.version, 1);
    console.log("✅ Paso H3 verificado: Reaprobar misma versión es completamente idempotente.");

    console.log("\n================================================================================");
    console.log("🎉 SUITE DE CICLO FINANCIERO PERSISTENTE PASADA EXITOSAMENTE EN POSTGRESQL REAL");
    console.log("================================================================================\n");

  } catch (error) {
    console.error("❌ ERROR EN SUITE FINANCIERA:", error);
    process.exit(1);
  } finally {
    // Limpieza de datos de prueba
    if (testContributionId) {
      await prisma.journalLine.deleteMany({
        where: {
          entry: {
            idempotencyKey: { in: [
              `owner-contrib-${testContributionId}`,
              `vendor-pay-wo-${testWorkOrderId}-${refPartial}`,
              `vendor-pay-wo-${testWorkOrderId}-${refFinal}`
            ]}
          }
        }
      });
      await prisma.journalEntry.deleteMany({
        where: {
          idempotencyKey: { in: [
            `owner-contrib-${testContributionId}`,
            `vendor-pay-wo-${testWorkOrderId}-${refPartial}`,
            `vendor-pay-wo-${testWorkOrderId}-${refFinal}`
          ]}
        }
      });
      await prisma.transaction.deleteMany({
        where: {
          propertyId: PROPERTY_ID,
          description: { contains: "Impermeabilización Techo Suite Real" }
        }
      });
      await prisma.ownerContribution.delete({ where: { id: testContributionId } }).catch(() => {});
    }
    if (setupEscrowEntryId) {
      await prisma.journalLine.deleteMany({ where: { entryId: setupEscrowEntryId } });
      await prisma.journalEntry.delete({ where: { id: setupEscrowEntryId } });
    }
    if (testQuoteId) {
      await prisma.workOrderQuote.delete({ where: { id: testQuoteId } }).catch(() => {});
    }
    if (testWorkOrderId) {
      await prisma.workOrder.delete({ where: { id: testWorkOrderId } }).catch(() => {});
    }
    await prisma.$disconnect();
    process.exit(0);
  }
}

runPersistentFinancialCycleSuite();
