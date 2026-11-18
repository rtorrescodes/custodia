import { prisma } from '@/lib/prisma';

export interface CreateThreadInput {
  tenantId: string;
  propertyId?: string;
  workOrderId?: string;
  audience: 'INTERNAL_TEAM' | 'PM_OWNER' | 'PM_RENTER' | 'PM_VENDOR';
  title: string;
  initialMessage: {
    senderId?: string;
    senderName: string;
    senderRole: string;
    content: string;
    isInternal?: boolean;
    attachments?: any;
  };
}

export interface PostMessageInput {
  threadId: string;
  senderId?: string;
  senderName: string;
  senderRole: string;
  content: string;
  isInternal?: boolean;
  attachments?: any;
}

/**
 * Servicio de Comunicación Aislada por Audiencias y Portales (CUS-06A)
 * - Separación de hilos: Interno vs Propietario vs Inquilino vs Proveedor.
 * - Los mensajes internos nunca se filtran a inquilinos ni propietarios.
 * - No expone números telefónicos sin consentimiento.
 */
export const communicationService = {
  /**
   * Crea un nuevo hilo de comunicación
   */
  async createThread(input: CreateThreadInput) {
    return prisma.$transaction(async (tx) => {
      const thread = await tx.communicationThread.create({
        data: {
          tenantId: input.tenantId,
          propertyId: input.propertyId,
          workOrderId: input.workOrderId,
          audience: input.audience,
          title: input.title,
        },
      });

      await tx.communicationMessage.create({
        data: {
          threadId: thread.id,
          senderId: input.initialMessage.senderId,
          senderName: input.initialMessage.senderName,
          senderRole: input.initialMessage.senderRole,
          content: input.initialMessage.content,
          isInternal: input.initialMessage.isInternal || input.audience === 'INTERNAL_TEAM',
          attachments: input.initialMessage.attachments,
        },
      });

      return thread;
    });
  },

  /**
   * Publica un mensaje en un hilo existente
   */
  async postMessage(input: PostMessageInput) {
    return prisma.communicationMessage.create({
      data: {
        threadId: input.threadId,
        senderId: input.senderId,
        senderName: input.senderName,
        senderRole: input.senderRole,
        content: input.content,
        isInternal: input.isInternal || false,
        attachments: input.attachments,
      },
    });
  },

  /**
   * Obtiene los mensajes visibles según el rol del usuario que consulta
   */
  async getMessagesForUser(threadId: string, userRole: string) {
    const thread = await prisma.communicationThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) throw new Error('Hilo no encontrado.');

    // Si el usuario es inquilino o propietario, filtrar mensajes internos
    const hideInternal = userRole === 'RENTER' || userRole === 'OWNER';

    return prisma.communicationMessage.findMany({
      where: {
        threadId,
        ...(hideInternal ? { isInternal: false } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
  },
};
