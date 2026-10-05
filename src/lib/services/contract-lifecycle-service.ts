import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export interface CreateContractDocumentInput {
  tenantId: string;
  leaseId: string;
  type?: 'LEASE_AGREEMENT' | 'ADDENDUM' | 'INSPECTION_ACTA' | 'TERMINATION' | 'OTHER';
  title: string;
  content: string; // Markdown or HTML representation
  fileUrl?: string;
  metadata?: any;
}

export interface RequestSignatureInput {
  documentId: string;
  signerEmail: string;
  signerName: string;
  signerRole: 'RENTER' | 'LANDLORD' | 'PM' | 'WITNESS';
  provider?: 'INTERNAL_DIGITAL' | 'DOCUSIGN' | 'MIFIE';
}

export interface CompleteSignatureInput {
  token: string;
  ipAddress: string;
  userAgent: string;
  handwrittenBase64?: string;
}

/**
 * Servicio del Ciclo de Vida de Contratos y Firma Electrónica Pluggable (CUS-04A / CUS-04B)
 * - Versionado e inmutabilidad con SHA-256 de integridad.
 * - Firma digital con bitácora de auditoría (IP, timestamp, hash).
 * - Advertencia explícita sobre NOM-151 / eIDAS vs firma operativa simple.
 * - Activación operacional del contrato cuando todas las partes firman.
 */
export const contractLifecycleService = {
  /**
   * Crea un nuevo documento contractual o una nueva versión inmutable
   */
  async createDocument(input: CreateContractDocumentInput) {
    // Calcular hash SHA-256 del contenido para integridad legal
    const hash = crypto.createHash('sha256').update(input.content).digest('hex');

    return prisma.$transaction(async (tx) => {
      // Marcar versiones anteriores como no vigentes
      await tx.contractDocument.updateMany({
        where: { leaseId: input.leaseId, isLatest: true },
        data: { isLatest: false },
      });

      const count = await tx.contractDocument.count({
        where: { leaseId: input.leaseId },
      });

      const doc = await tx.contractDocument.create({
        data: {
          tenantId: input.tenantId,
          leaseId: input.leaseId,
          type: input.type || 'LEASE_AGREEMENT',
          title: input.title,
          version: count + 1,
          fileUrl: input.fileUrl,
          fileSha256: hash,
          isLatest: true,
          metadata: {
            content: input.content,
            disclaimer: 'Firma operativa de consentimiento simple. Para fuerza legal plena NOM-151/eIDAS se requiere prestador acreditado (PSC).',
            ...(input.metadata || {}),
          },
        },
      });

      return doc;
    });
  },

  /**
   * Genera una solicitud de firma para un documento
   */
  async requestSignature(input: RequestSignatureInput) {
    const token = `sig_${crypto.randomBytes(24).toString('hex')}`;

    return prisma.signatureRequest.create({
      data: {
        documentId: input.documentId,
        signerEmail: input.signerEmail,
        signerName: input.signerName,
        signerRole: input.signerRole,
        provider: input.provider || 'INTERNAL_DIGITAL',
        status: 'PENDING',
        signatureToken: token,
      },
    });
  },

  /**
   * Registra la firma efectiva y evalúa si el contrato debe activarse operacionalmente
   */
  async completeSignature(input: CompleteSignatureInput) {
    return prisma.$transaction(async (tx) => {
      const sigReq = await tx.signatureRequest.findUnique({
        where: { signatureToken: input.token },
        include: {
          document: {
            include: { lease: true },
          },
        },
      });

      if (!sigReq) {
        throw new Error('Solicitud de firma inválida o expirada.');
      }

      if (sigReq.status === 'SIGNED') {
        return { success: true, alreadySigned: true, documentId: sigReq.documentId };
      }

      const signedAt = new Date();
      const auditTrail = {
        signedAt: signedAt.toISOString(),
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        hasHandwrittenSignature: !!input.handwrittenBase64,
        integritySha256: sigReq.document.fileSha256,
        legalNotice: 'Consentimiento electrónico registrado conforme a Código de Comercio de México (Art. 89). Verificación criptográfica sin PSC/NOM-151 por omisión.',
      };

      // 1. Actualizar solicitud de firma
      await tx.signatureRequest.update({
        where: { id: sigReq.id },
        data: {
          status: 'SIGNED',
          signedAt,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          signatureEvidence: auditTrail,
        },
      });

      // 2. Comprobar si todas las firmas requeridas del documento están completadas
      const pendingCount = await tx.signatureRequest.count({
        where: {
          documentId: sigReq.documentId,
          status: 'PENDING',
        },
      });

      // Si no quedan firmas pendientes, activar el contrato de arrendamiento si estaba en PENDING_SIGNATURE
      let leaseActivated = false;
      if (pendingCount === 0 && sigReq.document.type === 'LEASE_AGREEMENT') {
        if (sigReq.document.lease.status === 'PENDING_SIGNATURE' || sigReq.document.lease.status === 'DRAFT') {
          await tx.lease.update({
            where: { id: sigReq.document.leaseId },
            data: { status: 'ACTIVE' },
          });
          leaseActivated = true;
        }
      }

      return {
        success: true,
        documentId: sigReq.documentId,
        leaseActivated,
      };
    });
  },
};
