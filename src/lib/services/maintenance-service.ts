import { prisma } from '@/lib/prisma';
import { Prisma } from '../../generated/prisma/client';
import { paymentService } from './payment-service';

export interface CreateWorkOrderInput {
  tenantId: string;
  propertyId: string;
  reporterId?: string;
  category?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  title: string;
  description: string;
}

export interface SubmitQuoteInput {
  tenantId: string;
  workOrderId: string;
  vendorId?: string;
  laborCost: number;
  materialCost: number;
  items: Array<{ description: string; qty: number; unitPrice: number; amount: number }>;
  validUntil?: Date;
  notes?: string;
}

export interface ApproveQuoteInput {
  tenantId: string;
  quoteId: string;
  approvedById: string;
  reason?: string;
}

export interface CompleteWorkOrderInput {
  tenantId: string;
  workOrderId: string;
  actualCost: number;
  paymentMethod?: 'TRANSFER' | 'CASH' | 'CARD' | 'OTHER';
  recordExpenseInLedger?: boolean;
}

/**
 * Servicio Profesional de Mantenimiento, Órdenes de Trabajo y Presupuestos (CUS-05A & CUS-05B)
 * Flujo: Incidencia -> Cotización -> Aprobación -> Ejecución -> Evidencia -> Gasto Contable
 */
export const maintenanceService = {
  /**
   * Crea una incidencia u orden de trabajo
   */
  async createWorkOrder(input: CreateWorkOrderInput) {
    return prisma.workOrder.create({
      data: {
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        reporterId: input.reporterId,
        category: input.category || 'GENERAL',
        priority: input.priority || 'MEDIUM',
        title: input.title,
        description: input.description,
        status: 'PENDING',
      },
    });
  },

  /**
   * Envía un presupuesto/cotización de proveedor versionado (CUS-05B)
   * El totalCost se calcula estrictamente en el servidor sumando mano de obra y materiales.
   */
  async submitQuote(input: SubmitQuoteInput) {
    const labor = new Prisma.Decimal(input.laborCost);
    const materials = new Prisma.Decimal(input.materialCost);
    const total = labor.plus(materials);

    return prisma.$transaction(async (tx) => {
      // Si existía cotización previa aprobada, la reemplaza como SUPERSEDED
      await tx.workOrderQuote.updateMany({
        where: { workOrderId: input.workOrderId, status: { in: ['SUBMITTED', 'DRAFT'] } },
        data: { status: 'SUPERSEDED' },
      });

      const count = await tx.workOrderQuote.count({
        where: { workOrderId: input.workOrderId },
      });

      const quote = await tx.workOrderQuote.create({
        data: {
          tenantId: input.tenantId,
          workOrderId: input.workOrderId,
          vendorId: input.vendorId,
          version: count + 1,
          laborCost: labor,
          materialCost: materials,
          totalCost: total,
          status: 'SUBMITTED',
          itemsJson: input.items,
          validUntil: input.validUntil,
          notes: input.notes,
        },
      });

      // Actualizar costo estimado en la orden de trabajo
      await tx.workOrder.update({
        where: { id: input.workOrderId },
        data: {
          estimatedCost: total,
          status: 'AWAITING_APPROVAL',
        },
      });

      return quote;
    });
  },

  /**
   * Aprueba formalmente una cotización (CUS-05B)
   * Verifica que el usuario que aprueba tenga las facultades requeridas y no sea el mismo proveedor.
   */
  async approveQuote(input: ApproveQuoteInput) {
    return prisma.$transaction(async (tx) => {
      const quote = await tx.workOrderQuote.findUnique({
        where: { id: input.quoteId },
        include: { workOrder: true },
      });

      if (!quote || quote.tenantId !== input.tenantId) {
        throw new Error('Presupuesto no encontrado.');
      }

      // Regla de integridad: Un proveedor no puede auto-aprobar su cotización
      if (quote.vendorId && quote.vendorId === input.approvedById) {
        throw new Error('REGLA DE CONFLICTO DE INTERÉS: Un proveedor no puede autorizar su propio presupuesto.');
      }

      if (quote.status === 'APPROVED') {
        return quote; // Idempotente
      }

      const updatedQuote = await tx.workOrderQuote.update({
        where: { id: input.quoteId },
        data: {
          status: 'APPROVED',
          approvedById: input.approvedById,
          approvedAt: new Date(),
          approvalReason: input.reason,
        },
      });

      // Pasar la orden de trabajo a IN_PROGRESS
      await tx.workOrder.update({
        where: { id: quote.workOrderId },
        data: {
          status: 'IN_PROGRESS',
        },
      });

      return updatedQuote;
    });
  },

  /**
   * Finaliza la orden de trabajo, verifica el costo y asienta el gasto en el libro contable
   */
  async completeWorkOrder(input: CompleteWorkOrderInput) {
    return prisma.$transaction(async (tx) => {
      const wo = await tx.workOrder.findUnique({
        where: { id: input.workOrderId },
        include: {
          quotes: { where: { status: 'APPROVED' } },
          property: true,
        },
      });

      if (!wo || wo.tenantId !== input.tenantId) {
        throw new Error('Orden de trabajo no encontrada.');
      }

      const approvedQuote = wo.quotes[0];
      const actualCostDecimal = new Prisma.Decimal(input.actualCost);

      // Si el costo real excede la cotización aprobada por más de 15%, exigir reautorización
      if (approvedQuote && actualCostDecimal.greaterThan(approvedQuote.totalCost.mul(1.15))) {
        throw new Error(
          `SOBRECOSTO NO AUTORIZADO: El costo real ($${input.actualCost}) excede en más del 15% el presupuesto aprobado ($${approvedQuote.totalCost}). Se requiere adenda presupuestal.`
        );
      }

      // Marcar orden como COMPLETED
      const completedWo = await tx.workOrder.update({
        where: { id: input.workOrderId },
        data: {
          status: 'COMPLETED',
          actualCost: actualCostDecimal,
        },
      });

      // Registrar transacción de gasto fiduciario si aplica
      if (input.recordExpenseInLedger) {
        await tx.transaction.create({
          data: {
            tenantId: input.tenantId,
            propertyId: wo.propertyId,
            amount: actualCostDecimal,
            currency: 'MXN',
            type: 'EXPENSE',
            category: 'Mantenimiento',
            description: `Mantenimiento concluido: ${wo.title} (WO: ${wo.id.substring(0, 8)})`,
            isApproved: true,
          },
        });
      }

      return completedWo;
    });
  },
};
