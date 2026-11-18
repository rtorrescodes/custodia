import { prisma } from '@/lib/prisma';
import { Prisma } from '../../generated/prisma/client';

export interface GenerateReceiptInput {
  tenantId: string;
  paymentId: string;
  payerTaxId?: string;
}

export interface ReceiptSnapshot {
  folio: string;
  issuedAt: string;
  tenantName: string;
  propertyName?: string;
  payerName: string;
  payerTaxId?: string;
  paymentMethod: string;
  paymentReference?: string;
  amount: number;
  currency: string;
  appliedCharges: Array<{
    concept: string;
    periodMonth: number;
    periodYear: number;
    amountApplied: number;
  }>;
  legalDisclaimer: string;
}

/**
 * Servicio de Generación y Emisión de Recibos Descargables (CUS-03D)
 * - Folio único secuencial con serie (REC-YYYY-000001).
 * - Snapshot inmutable JSON en el momento del pago.
 * - Leyenda legal expresa de no deducible / comprobante interno sin validez de CFDI.
 */
export const receiptService = {
  /**
   * Genera el recibo para un pago confirmado. Es idempotente: si ya existe para ese paymentId, lo devuelve.
   */
  async generateReceipt(input: GenerateReceiptInput) {
    const existing = await prisma.receipt.findUnique({
      where: { paymentId: input.paymentId },
    });

    if (existing) {
      return existing;
    }

    return prisma.$transaction(async (tx) => {
      // 1. Obtener pago con sus aplicaciones, cargo, contrato y propiedad
      const payment = await tx.payment.findUnique({
        where: { id: input.paymentId },
        include: {
          tenant: true,
          lease: {
            include: { property: true },
          },
          applications: {
            include: { charge: true },
          },
        },
      });

      if (!payment) {
        throw new Error('Pago no encontrado.');
      }

      if (payment.status !== 'CONFIRMED' && payment.status !== 'CLEARED') {
        throw new Error('Solo se pueden emitir recibos para pagos confirmados o liquidados.');
      }

      // 2. Calcular consecutivo único por tenant y año
      const currentYear = new Date().getFullYear();
      const series = `REC-${currentYear}`;

      const lastReceipt = await tx.receipt.findFirst({
        where: {
          tenantId: input.tenantId,
          series,
        },
        orderBy: { consecutiveNum: 'desc' },
      });

      const nextNum = (lastReceipt?.consecutiveNum || 0) + 1;
      const formattedFolio = `${series}-${String(nextNum).padStart(6, '0')}`;

      // 3. Construir snapshot inmutable
      const appliedCharges = payment.applications.map((app) => ({
        concept: app.charge.concept,
        periodMonth: app.charge.periodMonth,
        periodYear: app.charge.periodYear,
        amountApplied: Number(app.amountApplied),
      }));

      const legalDisclaimer = 'Comprobante interno de pago sin validez fiscal (No deducible / No CFDI).';

      const snapshot: ReceiptSnapshot = {
        folio: formattedFolio,
        issuedAt: new Date().toISOString(),
        tenantName: payment.tenant.name,
        propertyName: payment.lease?.property?.name,
        payerName: payment.payerName,
        payerTaxId: input.payerTaxId,
        paymentMethod: payment.method,
        paymentReference: payment.reference || undefined,
        amount: Number(payment.amount),
        currency: payment.currency,
        appliedCharges,
        legalDisclaimer,
      };

      // 4. Crear registro inmutable de Recibo
      const receipt = await tx.receipt.create({
        data: {
          tenantId: input.tenantId,
          paymentId: payment.id,
          leaseId: payment.leaseId,
          folio: formattedFolio,
          series,
          consecutiveNum: nextNum,
          amount: payment.amount,
          currency: payment.currency,
          payerName: payment.payerName,
          payerTaxId: input.payerTaxId,
          legalDisclaimer,
          snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
          status: 'ISSUED',
        },
      });

      return receipt;
    });
  },

  /**
   * Obtiene los recibos de un contrato o tenant
   */
  async getReceiptsForLease(tenantId: string, leaseId: string) {
    return prisma.receipt.findMany({
      where: { tenantId, leaseId },
      orderBy: { issuedAt: 'desc' },
    });
  },

  /**
   * Renderiza el recibo en formato HTML imprimible/descargable
   */
  renderReceiptHtml(snapshot: ReceiptSnapshot): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>Recibo ${snapshot.folio}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; background: #fff; }
          .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; }
          .title { font-size: 24px; font-weight: bold; color: #0f172a; }
          .folio { font-size: 18px; font-weight: 600; color: #475569; }
          .details { margin-bottom: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
          .label { font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: bold; }
          .val { font-size: 15px; font-weight: 500; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #f8fafc; text-align: left; padding: 12px; font-size: 12px; color: #475569; border-bottom: 1px solid #e2e8f0; }
          td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
          .total-box { text-align: right; font-size: 20px; font-weight: bold; margin-bottom: 40px; }
          .disclaimer { border-top: 1px dashed #cbd5e1; padding-top: 15px; font-size: 11px; color: #64748b; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">${snapshot.tenantName}</div>
            <div style="font-size: 13px; color: #64748b;">Administración y Custodia de Propiedades</div>
          </div>
          <div style="text-align: right;">
            <div class="folio">${snapshot.folio}</div>
            <div style="font-size: 13px; color: #64748b;">Fecha: ${new Date(snapshot.issuedAt).toLocaleDateString()}</div>
          </div>
        </div>

        <div class="details">
          <div>
            <div class="label">Pagador</div>
            <div class="val">${snapshot.payerName}</div>
            ${snapshot.payerTaxId ? `<div style="font-size: 12px; color: #64748b;">RFC/ID: ${snapshot.payerTaxId}</div>` : ''}
          </div>
          <div>
            <div class="label">Inmueble / Unidad</div>
            <div class="val">${snapshot.propertyName || 'N/A'}</div>
          </div>
          <div>
            <div class="label">Método de Pago</div>
            <div class="val">${snapshot.paymentMethod} ${snapshot.paymentReference ? `(${snapshot.paymentReference})` : ''}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Periodo</th>
              <th style="text-align: right;">Monto Aplicado</th>
            </tr>
          </thead>
          <tbody>
            ${snapshot.appliedCharges.map(c => `
              <tr>
                <td>${c.concept}</td>
                <td>${c.periodMonth}/${c.periodYear}</td>
                <td style="text-align: right;">$${c.amountApplied.toLocaleString()} ${snapshot.currency}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-box">
          Total Pagado: $${snapshot.amount.toLocaleString()} ${snapshot.currency}
        </div>

        <div class="disclaimer">
          ⚠️ <strong>AVISO IMPORTANTE:</strong> ${snapshot.legalDisclaimer}
        </div>
      </body>
      </html>
    `;
  },
};
