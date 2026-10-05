import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { monthlyClosingService } from '../src/lib/services/monthly-closing-service';
import { entitlementService } from '../src/lib/services/entitlement-service';
import { notificationService } from '../src/lib/services/notification-service';

test('📊 SUITE DE CIERRE MENSUAL, CONTROL DE CARTERA Y SAAS (CUS-07 & CUS-08)', async (t) => {
  const tenant = await prisma.tenant.findFirst();
  const user = await prisma.user.findFirst();

  assert.ok(tenant, 'Debe existir un tenant');
  assert.ok(user, 'Debe existir un usuario');

  const tenantId = tenant.id;
  const adminId = user.id;

  await t.test('CUS07-TC-01: Ejecución de cierre mensual con snapshot y bloqueo', async () => {
    const closing = await monthlyClosingService.executeMonthlyClosing({
      tenantId,
      year: 2026,
      month: 1,
      currency: 'MXN',
      closedById: adminId,
    });

    assert.equal(closing.status, 'CLOSED');
    assert.equal(closing.periodYear, 2026);
    assert.equal(closing.periodMonth, 1);

    const isClosed = await monthlyClosingService.isPeriodClosed(tenantId, 2026, 1);
    assert.equal(isClosed, true);

    // Intentar cerrar nuevamente debe ser rechazado
    await assert.rejects(
      async () => {
        await monthlyClosingService.executeMonthlyClosing({
          tenantId,
          year: 2026,
          month: 1,
          currency: 'MXN',
          closedById: adminId,
        });
      },
      /ya se encuentra cerrado/
    );
  });

  await t.test('CUS07-TC-02: Reapertura auditada de periodo contable con justificación', async () => {
    // Intento sin justificación debe fallar
    await assert.rejects(
      async () => {
        await monthlyClosingService.reopenMonthlyClosing({
          tenantId,
          year: 2026,
          month: 1,
          reopenedById: adminId,
          reason: '   ',
        });
      },
      /motivo explícito/
    );

    // Reapertura legítima
    const reopened = await monthlyClosingService.reopenMonthlyClosing({
      tenantId,
      year: 2026,
      month: 1,
      reopenedById: adminId,
      reason: 'Ajuste de partida conciliatoria extemporánea requerida por auditoría.',
    });

    assert.equal(reopened.status, 'REOPENED');
    assert.equal(reopened.reopenReason, 'Ajuste de partida conciliatoria extemporánea requerida por auditoría.');

    const isClosedNow = await monthlyClosingService.isPeriodClosed(tenantId, 2026, 1);
    assert.equal(isClosedNow, false);
  });

  await t.test('CUS08-TC-01: Control de límites y entitlements en servidor (SaaS)', async () => {
    // Tenant está en plan FREE (límite 2 unidades)
    const limits = await entitlementService.getTenantPlanLimits(tenantId);
    assert.equal(limits.maxUnits, 2);

    // Como el seed ya tiene 2 propiedades, un intento de agregar una tercera debe fallar
    await assert.rejects(
      async () => {
        await entitlementService.assertCanAddProperty(tenantId);
      },
      /LÍMITE DE PLAN EXCEDIDO/
    );
  });

  await t.test('CUS08-TC-02: Notificaciones internas con deduplicación estricta', async () => {
    const dedupeKey = `DEDUPE_${Date.now()}`;

    // Primera emisión
    const notif1 = await notificationService.sendNotification({
      tenantId,
      eventType: 'PAYMENT_RECEIVED',
      title: 'Pago Recibido',
      message: 'Se ha recibido un pago de renta por $18,000 MXN',
      dedupeKey,
    });

    assert.ok(notif1.id);

    // Segunda emisión idéntica: debe retornar la misma sin duplicar
    const notif2 = await notificationService.sendNotification({
      tenantId,
      eventType: 'PAYMENT_RECEIVED',
      title: 'Pago Recibido',
      message: 'Se ha recibido un pago de renta por $18,000 MXN',
      dedupeKey,
    });

    assert.equal(notif1.id, notif2.id);

    const userNotifs = await notificationService.getUserNotifications(tenantId);
    assert.ok(userNotifs.length >= 1);
  });
});
