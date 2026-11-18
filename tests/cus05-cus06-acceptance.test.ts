import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { maintenanceService } from '../src/lib/services/maintenance-service';
import { assetManagementService } from '../src/lib/services/asset-management-service';
import { alddeaDelegationService } from '../src/lib/services/alddea-delegation-service';
import { communicationService } from '../src/lib/services/communication-service';

test('🛠️ SUITE DE MANTENIMIENTO, ACCESOS Y COMUNICACIÓN (CUS-05 & CUS-06)', async (t) => {
  const tenant = await prisma.tenant.findFirst();
  const property = await prisma.property.findFirst();
  const user = await prisma.user.findFirst();

  assert.ok(tenant, 'Debe existir un tenant');
  assert.ok(property, 'Debe existir una propiedad');
  assert.ok(user, 'Debe existir un usuario');

  const tenantId = tenant.id;
  const propertyId = property.id;
  const adminId = user.id;

  let createdWorkOrderId: string;
  let createdQuoteId: string;

  await t.test('CUS05-TC-01: Creación de incidencia de mantenimiento (fuga de agua)', async () => {
    const wo = await maintenanceService.createWorkOrder({
      tenantId,
      propertyId,
      reporterId: adminId,
      category: 'PLUMBING',
      priority: 'HIGH',
      title: 'Fuga de agua en lavabo principal',
      description: 'Goteo continuo con riesgo de daño a mueble de madera.',
    });

    assert.ok(wo.id);
    assert.equal(wo.status, 'PENDING');
    assert.equal(wo.priority, 'HIGH');
    createdWorkOrderId = wo.id;
  });

  await t.test('CUS05-TC-02: Cotización de proveedor con total calculado en servidor y regla de conflicto', async () => {
    const quote = await maintenanceService.submitQuote({
      tenantId,
      workOrderId: createdWorkOrderId,
      vendorId: 'vendor-1234',
      laborCost: 1500,
      materialCost: 800,
      items: [
        { description: 'Cambio de empaque y manguera cofles', qty: 2, unitPrice: 400, amount: 800 },
        { description: 'Mano de obra fontanería certificada', qty: 1, unitPrice: 1500, amount: 1500 },
      ],
    });

    assert.equal(Number(quote.totalCost), 2300);
    assert.equal(quote.version, 1);
    assert.equal(quote.status, 'SUBMITTED');
    createdQuoteId = quote.id;

    // Regla de conflicto de interés: el proveedor no puede auto-aprobar
    await assert.rejects(
      async () => {
        await maintenanceService.approveQuote({
          tenantId,
          quoteId: quote.id,
          approvedById: 'vendor-1234',
        });
      },
      /REGLA DE CONFLICTO DE INTERÉS/
    );
  });

  await t.test('CUS05-TC-03: Aprobación legítima por administrador y avance a IN_PROGRESS', async () => {
    const approved = await maintenanceService.approveQuote({
      tenantId,
      quoteId: createdQuoteId,
      approvedById: adminId,
      reason: 'Costo razonable conforme a tabulador de plaza',
    });

    assert.equal(approved.status, 'APPROVED');

    const updatedWo = await prisma.workOrder.findUnique({ where: { id: createdWorkOrderId } });
    assert.equal(updatedWo?.status, 'IN_PROGRESS');
  });

  await t.test('CUS05-TC-04: Delegación de pase de acceso Alddea (Mock seguro)', async () => {
    const pass = await alddeaDelegationService.preparePass({
      tenantId,
      workOrderId: createdWorkOrderId,
      visitorName: 'Juan Fontanero',
      visitorCompany: 'Servicios Hidráulicos del Norte',
      purpose: 'Reparación de fuga bajo WO autorizada',
      validFrom: new Date(),
      validTo: new Date(Date.now() + 86400000),
      delegatedById: adminId,
    });

    assert.equal(pass.isMock, true);
    assert.equal(pass.status, 'PREPARED');
    assert.ok(pass.externalPassId);
  });

  await t.test('CUS05-TC-05: Conclusión de orden de trabajo con impacto contable', async () => {
    const completed = await maintenanceService.completeWorkOrder({
      tenantId,
      workOrderId: createdWorkOrderId,
      actualCost: 2300,
      recordExpenseInLedger: true,
    });

    assert.equal(completed.status, 'COMPLETED');
    assert.equal(Number(completed.actualCost), 2300);

    // Verificar que se registró la transacción en el ledger
    const tx = await prisma.transaction.findFirst({
      where: {
        tenantId,
        propertyId,
        type: 'EXPENSE',
        amount: 2300,
      },
      orderBy: { createdAt: 'desc' },
    });

    assert.ok(tx);
    assert.match(tx.description, /Mantenimiento concluido/);
  });

  await t.test('CUS05-TC-06: Inventario de activos y detección de mantenimiento vencido', async () => {
    const asset = await assetManagementService.createAsset({
      tenantId,
      propertyId,
      name: 'Aire Acondicionado Inverter 1.5T',
      category: 'HVAC',
      brand: 'Mirage',
      maintenanceIntervalMonths: 6,
    });

    assert.ok(asset.id);

    const dueAssets = await assetManagementService.getAssetsDueForMaintenance(tenantId);
    assert.ok(dueAssets.some((a) => a.id === asset.id));
  });

  await t.test('CUS06-TC-01: Aislamiento estricto de mensajes internos en comunicación', async () => {
    const thread = await communicationService.createThread({
      tenantId,
      propertyId,
      workOrderId: createdWorkOrderId,
      audience: 'PM_RENTER',
      title: 'Seguimiento de Fuga',
      initialMessage: {
        senderId: adminId,
        senderName: 'Administración',
        senderRole: 'PM_ADMIN',
        content: 'Estimado residente, el fontanero acudirá hoy a las 16:00 hrs.',
        isInternal: false,
      },
    });

    // Añadir mensaje interno de staff
    await communicationService.postMessage({
      threadId: thread.id,
      senderId: adminId,
      senderName: 'Coordinador Mantenimiento',
      senderRole: 'PM_ADMIN',
      content: 'NOTA INTERNA: Verificar cobro de deducible si fue negligencia del usuario.',
      isInternal: true,
    });

    // Consulta como PM: ve 2 mensajes
    const pmMessages = await communicationService.getMessagesForUser(thread.id, 'PM_ADMIN');
    assert.equal(pmMessages.length, 2);

    // Consulta como Inquilino: ve solo 1 mensaje (el interno queda bloqueado)
    const renterMessages = await communicationService.getMessagesForUser(thread.id, 'RENTER');
    assert.equal(renterMessages.length, 1);
    assert.equal(renterMessages[0].isInternal, false);
  });
});
