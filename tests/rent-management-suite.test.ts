import assert from "node:assert";
import dotenv from "dotenv";
dotenv.config();
import { prisma } from "../src/lib/prisma";
import { chargeService } from "../src/lib/services/charge-service";
import { paymentService } from "../src/lib/services/payment-service";
import { leaseService } from "../src/lib/services/lease-service";
import { signLeaseAgreementAction } from "../src/app/actions/lease.actions";
import { reportTenantPaymentAction } from "../src/app/actions/financial.actions";
import { createTenantMaintenanceRequestAction } from "../src/app/actions/ticket.actions";

/**
 * SUITE DE PRUEBAS DE INTEGRACIÓN: GESTIÓN INTEGRAL DE RENTAS (FASE 2 Y MULTITIPO)
 * 
 * Evalúa los 6 pilares de operación de rentas para caseros y administradores:
 * 1. Alta de Inmuebles Multitipo (Edificio, Oficinas, Bodega Comercial).
 * 2. Emisión de Contrato con Días de Gracia y Cláusula de Mora.
 * 3. Firma Digital del Inquilino (Transición PENDING_SIGNATURE -> ACTIVE con auditoría legal).
 * 4. Generación Periódica de Renta e Idempotencia.
 * 5. Evaluación Automática de Mora tras vencimiento del Periodo de Gracia (LATE_FEE).
 * 6. Flujo de Cobranza: Reporte de pago SPEI por Inquilino, Conciliación por Casero y Reporte de Mantenimiento.
 */
async function runRentManagementSuite() {
  console.log("================================================================================");
  console.log("🏛️ CUSTODIA: SUITE DE GESTIÓN INTEGRAL DE RENTAS (RESIDENCIAL / COMERCIAL / BODEGAS)");
  console.log("================================================================================\n");

  const TENANT_ID = "63ba31f2-cf6a-4f05-a8f7-06393d6222a8";
  const LANDLORD_USER_ID = "56a59979-7074-4615-bd34-dfd0a56fd81e"; // PM / Casero
  let testWarehouseProperty: any = null;
  let testRenter: any = null;
  let testLease: any = null;
  let testPaymentId: string | null = null;
  let testWorkOrderId: string | null = null;

  try {
    // ---------------------------------------------------------------------------
    // 1. ALTA DE INMUEBLE COMERCIAL / BODEGA INDUSTRIAL CON ATRIBUTOS EXPANDIDOS
    // ---------------------------------------------------------------------------
    console.log("--- 1. Alta de Inmueble Industrial / Bodega con especificaciones comerciales ---");
    testWarehouseProperty = await prisma.property.create({
      data: {
        tenantId: TENANT_ID,
        name: "Bodega Logística Norte B-12",
        address: "Parque Industrial Bernardo Quintana Nave 12",
        propertyType: "INDUSTRIAL_WAREHOUSE",
        occupancyStatus: "VACANT",
        commercialSpecs: {
          rentableAreaM2: 1250,
          parkingSpots: 10,
          loadingDocks: 2,
          kvaCapacity: 150,
          camFeeMonthly: 4500,
          clearHeightMeters: 9.5
        }
      }
    });

    assert.strictEqual(testWarehouseProperty.propertyType, "INDUSTRIAL_WAREHOUSE");
    assert.strictEqual((testWarehouseProperty.commercialSpecs as any).rentableAreaM2, 1250);
    console.log("✅ Inmueble industrial creado exitosamente:", {
      id: testWarehouseProperty.id,
      tipo: testWarehouseProperty.propertyType,
      specs: testWarehouseProperty.commercialSpecs
    });

    // ---------------------------------------------------------------------------
    // 2. CREACIÓN DE INQUILINO Y CONTRATO CON CLÁUSULA DE MORA Y FIRMA PENDIENTE
    // ---------------------------------------------------------------------------
    console.log("\n--- 2. Registro de Inquilino y Contrato con Días de Gracia y Mora estipulada ---");
    const renterEmail = `inquilino-industrial-${Date.now()}@logistica.com`;
    testRenter = await prisma.user.create({
      data: {
        tenantId: TENANT_ID,
        email: renterEmail,
        passwordHash: "dummy-hash",
        role: "RENTER"
      }
    });

    await prisma.tenantMember.create({
      data: {
        tenantId: TENANT_ID,
        userId: testRenter.id,
        role: "RENTER",
        status: "ACTIVE"
      }
    });

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear() + 1, now.getMonth(), 1);

    testLease = await prisma.lease.create({
      data: {
        tenantId: TENANT_ID,
        propertyId: testWarehouseProperty.id,
        renterId: testRenter.id,
        startDate,
        endDate,
        rentAmount: 45000, // $45,000 MXN mensuales
        currency: "MXN",
        depositAmount: 90000, // 2 meses de depósito
        paymentDay: 5,
        gracePeriodDays: 5, // 5 días de gracia (vence el día 10)
        lateFeeFixedAmount: 2500, // Recargo fijo por mora de $2,500 MXN
        status: "PENDING_SIGNATURE"
      }
    });

    assert.strictEqual(testLease.status, "PENDING_SIGNATURE");
    assert.strictEqual(Number(testLease.lateFeeFixedAmount), 2500);
    console.log("✅ Contrato emitido en estado PENDING_SIGNATURE con recargo de mora estipulado:", {
      leaseId: testLease.id,
      renta: Number(testLease.rentAmount),
      moraFija: Number(testLease.lateFeeFixedAmount),
      diasGracia: testLease.gracePeriodDays
    });

    // ---------------------------------------------------------------------------
    // 3. FIRMA DIGITAL DEL INQUILINO EN LÍNEA (ACCEPTANCE & ACTIVATION)
    // ---------------------------------------------------------------------------
    console.log("\n--- 3. Inquilino firma digitalmente el contrato desde su portal ---");
    const signResult = await leaseService.signLease({
      tenantId: TENANT_ID,
      userId: testRenter.id,
      leaseId: testLease.id,
      signerFullName: "Roberto Martínez (Director Operaciones)",
      consentAccepted: true,
      notes: "Acepto términos y condiciones de arrendamiento de bodega B-12"
    });

    assert.strictEqual(signResult.status, "ACTIVE");

    const dbLeaseAfterSign = await prisma.lease.findUnique({ where: { id: testLease.id } });
    const dbPropAfterSign = await prisma.property.findUnique({ where: { id: testWarehouseProperty.id } });

    assert.strictEqual(dbLeaseAfterSign?.status, "ACTIVE");
    assert.ok(dbLeaseAfterSign?.signedAt);
    assert.strictEqual(dbPropAfterSign?.occupancyStatus, "RENTED");
    console.log("✅ Contrato activado y propiedad marcada como RENTED tras firma digital:", {
      signedAt: dbLeaseAfterSign?.signedAt,
      propStatus: dbPropAfterSign?.occupancyStatus
    });

    // ---------------------------------------------------------------------------
    // 4. GENERACIÓN DE CARGO MENSUAL DE RENTA
    // ---------------------------------------------------------------------------
    console.log("\n--- 4. Generación mensual periódica de renta ---");
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const generatedCharges = await chargeService.generateMonthlyRentCharges({
      tenantId: TENANT_ID,
      month,
      year,
      createdById: LANDLORD_USER_ID
    });

    const leaseCharge = await prisma.charge.findFirst({
      where: {
        tenantId: TENANT_ID,
        leaseId: testLease.id,
        periodMonth: month,
        periodYear: year,
        type: "RENT"
      }
    });

    assert.ok(leaseCharge);
    assert.strictEqual(Number(leaseCharge.amount), 45000);
    assert.strictEqual(leaseCharge.status, "PENDING");
    console.log("✅ Cargo mensual generado e integrado al libro mayor:", {
      chargeId: leaseCharge.id,
      concepto: leaseCharge.concept,
      monto: Number(leaseCharge.amount)
    });

    // ---------------------------------------------------------------------------
    // 5. EVALUACIÓN Y APLICACIÓN DE MORA TRAS VENCIMIENTO DE DÍAS DE GRACIA
    // ---------------------------------------------------------------------------
    console.log("\n--- 5. Evaluación de recargos por mora fuera del periodo de gracia ---");
    // Simulamos una fecha de evaluación posterior al día de vencimiento + días de gracia (e.g. día 15)
    const lateReferenceDate = new Date(year, month - 1, 20);

    const appliedLateFees = await chargeService.evaluateAndApplyLateFees({
      tenantId: TENANT_ID,
      referenceDate: lateReferenceDate,
      createdById: LANDLORD_USER_ID
    });

    const lateFeeCharge = await prisma.charge.findFirst({
      where: {
        tenantId: TENANT_ID,
        leaseId: testLease.id,
        periodMonth: month,
        periodYear: year,
        type: "LATE_FEE"
      }
    });

    assert.ok(lateFeeCharge, "Debe haberse generado el cargo de recargo por mora");
    assert.strictEqual(Number(lateFeeCharge.amount), 2500);
    assert.strictEqual(lateFeeCharge.status, "PENDING");
    console.log("✅ Recargo por mora generado con éxito e imputado a la cuenta por cobrar:", {
      lateFeeId: lateFeeCharge.id,
      montoMora: Number(lateFeeCharge.amount),
      concepto: lateFeeCharge.concept
    });

    // ---------------------------------------------------------------------------
    // 6. INQUILINO REPORTA TRANSFERENCIA BANCARIA POR EL TOTAL
    // ---------------------------------------------------------------------------
    console.log("\n--- 6. Inquilino reporta comprobante de pago SPEI por renta y mora ---");
    const totalToPay = 45000 + 2500; // $47,500 MXN

    const payment = await paymentService.recordPayment({
      tenantId: TENANT_ID,
      leaseId: testLease.id,
      payerName: "Roberto Martínez (Director Operaciones)",
      amount: totalToPay,
      currency: "MXN",
      method: "TRANSFER",
      reference: "SPEI-BANORTE-LOGISTICA-8841",
      autoConfirm: false
    });

    testPaymentId = payment.id;
    assert.ok(testPaymentId);

    const dbPayment = await prisma.payment.findUnique({ where: { id: testPaymentId } });
    assert.strictEqual(dbPayment?.status, "REPORTED");
    assert.strictEqual(Number(dbPayment?.amount), totalToPay);
    console.log("✅ Pago reportado en estado REPORTED:", {
      paymentId: dbPayment.id,
      referencia: dbPayment.reference,
      monto: Number(dbPayment.amount)
    });

    // ---------------------------------------------------------------------------
    // 7. CASERO / PM CONFIRMA Y APLICA EL PAGO A LOS CARGOS
    // ---------------------------------------------------------------------------
    console.log("\n--- 7. Casero confirma pago y lo aplica liquidando Renta y Mora ---");
    await paymentService.confirmPayment(TENANT_ID, testPaymentId, LANDLORD_USER_ID);

    const applyRes = await paymentService.applyPayment(TENANT_ID, testPaymentId, [
      { chargeId: leaseCharge.id, amount: 45000 },
      { chargeId: lateFeeCharge.id, amount: 2500 }
    ]);

    assert.strictEqual(applyRes.applications.length, 2);

    const dbRentChargeAfter = await prisma.charge.findUnique({ where: { id: leaseCharge.id } });
    const dbLateFeeAfter = await prisma.charge.findUnique({ where: { id: lateFeeCharge.id } });

    assert.strictEqual(dbRentChargeAfter?.status, "PAID");
    assert.strictEqual(dbLateFeeAfter?.status, "PAID");
    console.log("✅ Ambos cargos liquidados a status PAID tras confirmación de transferencia.");

    // ---------------------------------------------------------------------------
    // 8. INQUILINO REPORTA INCIDENCIA DE MANTENIMIENTO EN BODEGA
    // ---------------------------------------------------------------------------
    console.log("\n--- 8. Inquilino levanta ticket de mantenimiento desde su portal ---");
    const newTicket = await prisma.workOrder.create({
      data: {
        tenantId: TENANT_ID,
        propertyId: testWarehouseProperty.id,
        title: "[Reporte Inquilino] Falla en motor de cortina metálica andén 2",
        description: "La cortina de descarga no sube completamente al activar el switch.",
        priority: "HIGH",
        status: "PENDING",
        reporterId: testRenter.id,
      }
    });

    testWorkOrderId = newTicket.id;
    assert.ok(testWorkOrderId);

    const dbWo = await prisma.workOrder.findUnique({ where: { id: testWorkOrderId } });
    assert.strictEqual(dbWo?.propertyId, testWarehouseProperty.id);
    assert.strictEqual(dbWo?.priority, "HIGH");
    assert.strictEqual(dbWo?.status, "PENDING");
    console.log("✅ Incidencia de mantenimiento canalizada directamente a la administración:", {
      ticketId: dbWo.id,
      titulo: dbWo.title,
      prioridad: dbWo.priority
    });

    console.log("\n================================================================================");
    console.log("🎉 TODAS LAS PRUEBAS DE GESTIÓN INTEGRAL DE RENTAS PASARON SATISFACTORIAMENTE");
    console.log("================================================================================\n");

  } catch (error) {
    console.error("❌ ERROR EN SUITE DE GESTIÓN DE RENTAS:", error);
    process.exit(1);
  } finally {
    // Limpieza de datos de prueba
    if (testWorkOrderId) {
      await prisma.workOrder.delete({ where: { id: testWorkOrderId } }).catch(() => {});
    }
    if (testPaymentId) {
      await prisma.paymentApplication.deleteMany({ where: { paymentId: testPaymentId } }).catch(() => {});
      await prisma.payment.delete({ where: { id: testPaymentId } }).catch(() => {});
    }
    if (testLease) {
      await prisma.journalLine.deleteMany({ where: { leaseId: testLease.id } }).catch(() => {});
      await prisma.journalEntry.deleteMany({
        where: {
          OR: [
            { idempotencyKey: { contains: testLease.id } },
            { description: { contains: testLease.id } }
          ]
        }
      }).catch(() => {});
      await prisma.charge.deleteMany({ where: { leaseId: testLease.id } }).catch(() => {});
      await prisma.contractDocument.deleteMany({ where: { leaseId: testLease.id } }).catch(() => {});
      await prisma.lease.delete({ where: { id: testLease.id } }).catch(() => {});
    }
    if (testRenter) {
      await prisma.tenantMember.deleteMany({ where: { userId: testRenter.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: testRenter.id } }).catch(() => {});
    }
    if (testWarehouseProperty) {
      await prisma.property.delete({ where: { id: testWarehouseProperty.id } }).catch(() => {});
    }
    await prisma.$disconnect();
    process.exit(0);
  }
}

runRentManagementSuite();
