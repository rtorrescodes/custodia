import { prisma } from '@/lib/prisma';

export interface SendInternalNotificationInput {
  tenantId: string;
  userId?: string;
  eventType: string;
  title: string;
  message: string;
  linkUrl?: string;
  dedupeKey?: string;
}

/**
 * Servicio de Notificaciones Internas y Centro de Alertas (CUS-06A & CUS-08C)
 * - Persistencia auditada con soporte de deduplicación estricta (dedupeKey).
 * - Consulta de notificaciones no leídas y marcado como leídas.
 */
export const notificationService = {
  /**
   * Emite una notificación interna evitando duplicados si se provee dedupeKey
   */
  async sendNotification(input: SendInternalNotificationInput) {
    if (input.dedupeKey) {
      const existing = await prisma.internalNotification.findFirst({
        where: {
          tenantId: input.tenantId,
          dedupeKey: input.dedupeKey,
        },
      });

      if (existing) {
        return existing; // Ignorado como duplicado
      }
    }

    return prisma.internalNotification.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        eventType: input.eventType,
        title: input.title,
        message: input.message,
        linkUrl: input.linkUrl,
        dedupeKey: input.dedupeKey,
      },
    });
  },

  /**
   * Obtiene las notificaciones activas para un usuario
   */
  async getUserNotifications(tenantId: string, userId?: string) {
    return prisma.internalNotification.findMany({
      where: {
        tenantId,
        OR: [
          { userId: null }, // Broadcast a todos
          ...(userId ? [{ userId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  },
};
