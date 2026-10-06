import assert from "node:assert";
import dotenv from "dotenv";
dotenv.config();
import { prisma, withTenantRLS } from "../src/lib/prisma";
import { accountingService } from "../src/lib/services/accounting-service";
import { propertyOperationsService } from "../src/lib/services/property-operations.service";
import { Prisma } from "../src/generated/prisma/client";

/**
 * PRUEBA DE CONCURRENCIA REAL EN POSTGRESQL (CUS-09C)
 * 
 * Evalúa los dos vectores críticos exigidos:
 * 1. Concurrencia de Órdenes vía propertyOperationsService.approveQuote:
 *    Dos cotizaciones concurrentes intentan autorizarse simultáneamente contra un disponible
 *    insuficiente para ambas. Demuestra que gracias al bloqueo 'SELECT ... FOR UPDATE' en PostgreSQL,
 *    exactamente una gana y pasa a IN_PROGRESS, y la otra queda en AWAITING_APPROVAL sin sobregiro.
 * 2. Idempotencia y No-Duplicación Concurrente vía propertyOperationsService.verifyOwnerContribution:
 *    Dos solicitudes simultáneas intentan verificar la misma aportación. Demuestra que no duplica
 *    asientos contables, movimientos de extracto ni saldos acumulados.
 */
async function runRealPgConcurrencySuite() {
  console.log("================================================================================");
  console.log("🐘 CUSTODIA: PRUEBA DE CONCURRENCIA REAL CONTRA POSTGRESQL (SERVICIOS COMPARTIDOS)");
  console.log("================================================================================\n");

  const TENANT_ID = "63ba31f2-cf6a-4f05-a8f7-06393d6222a8";
  const PROPERTY_ID = "f28e8fa3-63e8-4113-b620-0cf181e2363c"; // Villa Serena
  const PM_USER_ID = "56a59979-7074-4615-bd34-dfd0a56fd81e";
  const OWNER_USER_ID = "41d2bb0d-42d5-4839-afd3-2630e6c7c132";

  let woA: any = null;
  let quoteA: any = null;
  let woB: any = null;
  let quoteB: any = null;
  let testContrib: any = null;

  try {
    // -------------------------------------------------------------------------
    // VECTOR 1: DOS ÓRDENES CONCURRENTES COMPITIENDO POR SALDO INSUFICIENTE
    // -------------------------------------------------------------------------
    console.log("--- VECTOR 1: COMPETENCIA CONCURRENTE DE ÓRDENES (ANTI-SOBREGIRO) ---");
    const checkSummary = await accountingService.getPropertyFiduciarySummary(TENANT_ID, PROPERTY_ID);
    const availableNow = checkSummary.disponibleNuevasObligaciones;
    console.log(`Disponible actual en Villa Serena: $${availableNow} MXN`);

    // Asegurar saldo suficiente para exactamente una orden ($6,000 en disponible)
    const accounts = await accountingService.ensureStandardChartOfAccounts(TENANT_ID);
    const needed = (6000 - availableNow) + checkSummary.reservaFaltante;
    let entryInject: any = null;
    if (needed > 0) {
      console.log(`Inyectando $${needed} MXN fiduciarios para calibrar prueba de concurrencia...`);
      entryInject = await accountingService.postEntry({
        tenantId: TENANT_ID,
        idempotencyKey: `concur-setup-${Date.now()}`,
        effectiveDate: new Date(),
        description: "Inyección de prueba para calibrar concurrencia",
        createdById: PM_USER_ID,
        lines: [
          {
            accountId: accounts.cashPmEscrow,
            debit: needed,
            credit: 0,
            currency: "MXN",
            propertyId: PROPERTY_ID,
            ownerId: OWNER_USER_ID
          },
          {
            accountId: accounts.ownerFundsPayable,
            debit: 0,
            credit: needed,
            currency: "MXN",
            propertyId: PROPERTY_ID,
            ownerId: OWNER_USER_ID
          }
        ]
      });
    }

    const calibratedSummary = await accountingService.getPropertyFiduciarySummary(TENANT_ID, PROPERTY_ID);
    const availableCalibrated = calibratedSummary.disponibleNuevasObligaciones;
    console.log(`Disponible calibrado en Villa Serena: $${availableCalibrated} MXN`);

    // Cada orden costará más del 50% del disponible para que ambas no quepan
    const orderCost = Math.max(4000, Math.floor(availableCalibrated * 0.6) + 100);
    console.log(`Configurando 2 órdenes por $${orderCost} MXN cada una (Total requerido: $${orderCost * 2} MXN > $${availableCalibrated} MXN)...`);

    woA = await prisma.workOrder.create({
      data: {
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        reporterId: PM_USER_ID,
        title: "Orden Concurrente A (Plomería)",
        description: `Reparación urgente plomería $${orderCost}`,
        status: "AWAITING_APPROVAL",
        estimatedCost: new Prisma.Decimal(orderCost),
        actualCost: 0
      }
    });

    quoteA = await prisma.workOrderQuote.create({
      data: {
        tenantId: TENANT_ID,
        workOrderId: woA.id,
        version: 1,
        laborCost: new Prisma.Decimal(orderCost * 0.5),
        materialCost: new Prisma.Decimal(orderCost * 0.5),
        totalCost: new Prisma.Decimal(orderCost),
        status: "SUBMITTED",
        itemsJson: [{ description: "Plomería", amount: orderCost }]
      }
    });

    woB = await prisma.workOrder.create({
      data: {
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        reporterId: PM_USER_ID,
        title: "Orden Concurrente B (Electricidad)",
        description: `Reparación urgente electricidad $${orderCost}`,
        status: "AWAITING_APPROVAL",
        estimatedCost: new Prisma.Decimal(orderCost),
        actualCost: 0
      }
    });

    quoteB = await prisma.workOrderQuote.create({
      data: {
        tenantId: TENANT_ID,
        workOrderId: woB.id,
        version: 1,
        laborCost: new Prisma.Decimal(orderCost * 0.5),
        materialCost: new Prisma.Decimal(orderCost * 0.5),
        totalCost: new Prisma.Decimal(orderCost),
        status: "SUBMITTED",
        itemsJson: [{ description: "Electricidad", amount: orderCost }]
      }
    });

    console.log(`Órdenes y cotizaciones creadas. Disparando Promise.all([approveQuote(A), approveQuote(B)])...`);

    // Invocamos directamente el servicio compartido que usa SELECT FOR UPDATE sobre la propiedad
    const [resA, resB] = await Promise.all([
      propertyOperationsService.approveQuote(TENANT_ID, OWNER_USER_ID, {
        quoteId: quoteA.id,
        expectedVersion: 1,
        reason: "Aprobación concurrente A"
      }),
      propertyOperationsService.approveQuote(TENANT_ID, OWNER_USER_ID, {
        quoteId: quoteB.id,
        expectedVersion: 1,
        reason: "Aprobación concurrente B"
      })
    ]);

    console.log("\nResultados obtenidos de la carrera concurrente:");
    console.log("Resultado A:", { hasSufficientFunds: resA.hasSufficientFunds, readyToStart: resA.readyToStart, deficit: resA.deficitAmount });
    console.log("Resultado B:", { hasSufficientFunds: resB.hasSufficientFunds, readyToStart: resB.readyToStart, deficit: resB.deficitAmount });

    // Verificación 1: Exactamente UNA orden fue autorizada para iniciar con fondos
    const oneWon = (resA.hasSufficientFunds && !resB.hasSufficientFunds) || (!resA.hasSufficientFunds && resB.hasSufficientFunds);
    assert.strictEqual(oneWon, true, "Exactamente una orden debe obtener los fondos; la otra debe detectar falta de fondos");

    const winnerName = resA.hasSufficientFunds ? "Orden A" : "Orden B";
    const loserName = resA.hasSufficientFunds ? "Orden B" : "Orden A";
    console.log(`🏆 Ganadora: ${winnerName} -> Autorizada para iniciar (IN_PROGRESS)`);
    console.log(`🛡️ Bloqueada: ${loserName} -> Aprobada pero pendiente de fondos (AWAITING_APPROVAL)`);

    // Verificar estado persistido en PostgreSQL
    const dbWoA = await prisma.workOrder.findUnique({ where: { id: woA.id } });
    const dbWoB = await prisma.workOrder.findUnique({ where: { id: woB.id } });

    if (resA.hasSufficientFunds) {
      assert.strictEqual(dbWoA?.status, "IN_PROGRESS");
      assert.strictEqual(dbWoB?.status, "AWAITING_APPROVAL");
    } else {
      assert.strictEqual(dbWoB?.status, "IN_PROGRESS");
      assert.strictEqual(dbWoA?.status, "AWAITING_APPROVAL");
    }

    console.log("✅ Vector 1 verificado: Cero sobregiro en PostgreSQL. La serialización por SELECT FOR UPDATE protegió el patrimonio fiduciario.\n");

    // -------------------------------------------------------------------------
    // VECTOR 2: DOS VERIFICACIONES CONCURRENTES DE LA MISMA APORTACIÓN
    // -------------------------------------------------------------------------
    console.log("--- VECTOR 2: VERIFICACIÓN CONCURRENTE DE APORTACIÓN (ANTI-DUPLICADOS) ---");
    testContrib = await prisma.ownerContribution.create({
      data: {
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        ownerId: OWNER_USER_ID,
        amount: new Prisma.Decimal(3500),
        currency: "MXN",
        destinationAccount: "PM_ESCROW",
        reason: "Prueba concurrencia de verificación anti-duplicados",
        status: "REPORTED",
        reportedAmount: new Prisma.Decimal(3500),
        reference: "SPEI-CONCUR-TEST-001"
      }
    });

    console.log(`Aportación creada en REPORTED: ${testContrib.id}. Disparando 2 llamadas concurrentes a verifyOwnerContribution...`);

    const [vRes1, vRes2] = await Promise.all([
      propertyOperationsService.verifyOwnerContribution(TENANT_ID, PM_USER_ID, {
        contributionId: testContrib.id,
        verifiedAmount: 3500,
        notes: "Verificación hilo 1"
      }),
      propertyOperationsService.verifyOwnerContribution(TENANT_ID, PM_USER_ID, {
        contributionId: testContrib.id,
        verifiedAmount: 3500,
        notes: "Verificación hilo 2"
      })
    ]);

    console.log("Resultados de verificación simultánea:", {
      vRes1Status: vRes1.status,
      vRes2Status: vRes2.status
    });

    assert.strictEqual(vRes1.status, "VERIFIED");
    assert.strictEqual(vRes2.status, "VERIFIED");

    // Verificar en BD que solo existe UN asiento contable y UNA transacción
    const entriesInDb = await prisma.journalEntry.findMany({
      where: {
        tenantId: TENANT_ID,
        idempotencyKey: `owner-contrib-${testContrib.id}`
      }
    });

    console.log(`Asientos contables creados para la aportación: ${entriesInDb.length}`);
    assert.strictEqual(entriesInDb.length, 1, "Debe existir exactamente 1 asiento contable; cero duplicación concurrente");

    const transactionsInDb = await prisma.transaction.findMany({
      where: {
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        description: { contains: "Prueba concurrencia de verificación anti-duplicados" }
      }
    });

    console.log(`Transacciones en extracto creadas: ${transactionsInDb.length}`);
    assert.strictEqual(transactionsInDb.length, 1, "Debe existir exactamente 1 movimiento en extracto; cero duplicación");

    console.log("✅ Vector 2 verificado: Idempotencia y atomicidad garantizan cero duplicación contable o de extractos.\n");

    console.log("================================================================================");
    console.log("🎉 SUITE DE CONCURRENCIA POSTGRESQL EXITOSA: VALIDACIÓN REAL SIN SIMULACIONES");
    console.log("================================================================================\n");

  } finally {
    // Limpieza de datos de prueba
    if (quoteA) await prisma.workOrderQuote.delete({ where: { id: quoteA.id } }).catch(() => {});
    if (woA) {
      await prisma.ownerContribution.deleteMany({ where: { workOrderId: woA.id } }).catch(() => {});
      await prisma.workOrder.delete({ where: { id: woA.id } }).catch(() => {});
    }
    if (quoteB) await prisma.workOrderQuote.delete({ where: { id: quoteB.id } }).catch(() => {});
    if (woB) {
      await prisma.ownerContribution.deleteMany({ where: { workOrderId: woB.id } }).catch(() => {});
      await prisma.workOrder.delete({ where: { id: woB.id } }).catch(() => {});
    }
    if (testContrib) {
      await prisma.journalLine.deleteMany({
        where: { entry: { idempotencyKey: `owner-contrib-${testContrib.id}` } }
      }).catch(() => {});
      await prisma.journalEntry.deleteMany({
        where: { idempotencyKey: `owner-contrib-${testContrib.id}` }
      }).catch(() => {});
      await prisma.transaction.deleteMany({
        where: { description: { contains: "Prueba concurrencia de verificación anti-duplicados" } }
      }).catch(() => {});
      await prisma.ownerContribution.delete({ where: { id: testContrib.id } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

runRealPgConcurrencySuite().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error("❌ ERROR EN SUITE DE CONCURRENCIA:", err);
  process.exit(1);
});
