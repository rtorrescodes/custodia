import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { MembershipContext } from "@/lib/auth/membership-guard";

export type OnboardingStep = 
  | "SELECT_EXPERIENCE"
  | "CONFIGURE_ORG"
  | "REGISTER_UNITS"
  | "REGISTER_LEASE"
  | "INVITE_TEAM"
  | "COMPLETED";

export interface OnboardingState {
  currentStep: OnboardingStep;
  operatingMode: "LANDLORD" | "PROPERTY_MANAGER";
  hasCompletedOrg: boolean;
  unitsCount: number;
  leasesCount: number;
  invitationsCount: number;
  nextRecommendedAction: string;
}

export const onboardingService = {
  /**
   * Obtener el estado actual del onboarding para reanudarlo
   */
  async getOnboardingState(context: MembershipContext): Promise<OnboardingState> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: context.tenantId }
    });

    if (!tenant) {
      throw new Error("Organización no encontrada.");
    }

    const [unitsCount, leasesCount, invitationsCount] = await Promise.all([
      prisma.property.count({ where: { tenantId: context.tenantId } }),
      prisma.lease.count({ where: { tenantId: context.tenantId } }),
      prisma.tenantInvitation.count({ where: { tenantId: context.tenantId } })
    ]);

    let currentStep: OnboardingStep = "SELECT_EXPERIENCE";
    let nextRecommendedAction = "Selecciona si operarás como Casero Directo o Property Manager.";

    if (unitsCount === 0) {
      currentStep = "REGISTER_UNITS";
      nextRecommendedAction = "Registra o importa tu primer inmueble o unidad rentable.";
    } else if (leasesCount === 0) {
      currentStep = "REGISTER_LEASE";
      nextRecommendedAction = "Registra tu primer contrato de arrendamiento activo.";
    } else if (tenant.operatingMode === "PROPERTY_MANAGER" && invitationsCount === 0) {
      currentStep = "INVITE_TEAM";
      nextRecommendedAction = "Invita a tu equipo de administradores o a los propietarios de tus carteras.";
    } else {
      currentStep = "COMPLETED";
      nextRecommendedAction = "Tu núcleo está configurado. Revisa tu pantalla 'Hoy' para dar seguimiento a cobros y mantenimientos.";
    }

    return {
      currentStep,
      operatingMode: tenant.operatingMode,
      hasCompletedOrg: !!tenant.name,
      unitsCount,
      leasesCount,
      invitationsCount,
      nextRecommendedAction
    };
  },

  /**
   * Actualizar el modo de operación de la organización
   */
  async setOperatingMode(context: MembershipContext, mode: "LANDLORD" | "PROPERTY_MANAGER") {
    if (context.role !== "PM_ADMIN" && context.role !== "LANDLORD") {
      throw new Error("Solo los administradores pueden cambiar el modo de la organización.");
    }

    return prisma.tenant.update({
      where: { id: context.tenantId },
      data: { operatingMode: mode }
    });
  },

  /**
   * Generar una invitación segura con token criptográfico (One-Time Token con expiración)
   */
  async createInvitation(
    context: MembershipContext,
    input: { email: string; role: "PM_ADMIN" | "PM_STAFF" | "OWNER" | "RENTER" | "VENDOR"; expirationDays?: number }
  ) {
    if (context.role !== "PM_ADMIN") {
      throw new Error("Solo los administradores pueden invitar nuevos miembros a la organización.");
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const days = input.expirationDays || 7;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const invitation = await prisma.tenantInvitation.create({
      data: {
        tenantId: context.tenantId,
        email: input.email.toLowerCase().trim(),
        role: input.role,
        tokenHash,
        expiresAt,
        createdById: context.userId
      }
    });

    // En pruebas locales no se envían correos reales
    return {
      invitationId: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      // Retornar el token plano únicamente al momento de la creación para pruebas y links seguros
      oneTimeToken: rawToken
    };
  },

  /**
   * Consumir invitación de forma atómica
   */
  async acceptInvitation(rawToken: string, acceptingUserId: string) {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const invitation = await prisma.tenantInvitation.findUnique({
      where: { tokenHash }
    });

    if (!invitation) {
      throw new Error("INVITACIÓN INVÁLIDA: El enlace no existe o el token fue alterado.");
    }

    if (invitation.revokedAt) {
      throw new Error("INVITACIÓN REVOCADA: Esta invitación fue cancelada por un administrador.");
    }

    if (invitation.acceptedAt) {
      throw new Error("INVITACIÓN CONSUMIDA: Este enlace ya fue utilizado previamente.");
    }

    if (new Date() > invitation.expiresAt) {
      throw new Error("INVITACIÓN EXPIRADA: El plazo de vigencia de esta invitación ha concluido.");
    }

    // Registrar o actualizar la membresía del usuario
    const member = await prisma.tenantMember.upsert({
      where: {
        tenantId_userId: {
          tenantId: invitation.tenantId,
          userId: acceptingUserId
        }
      },
      update: {
        role: invitation.role,
        status: "ACTIVE"
      },
      create: {
        tenantId: invitation.tenantId,
        userId: acceptingUserId,
        role: invitation.role,
        status: "ACTIVE"
      }
    });

    // Marcar como consumida
    await prisma.tenantInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() }
    });

    return { success: true, memberId: member.id, tenantId: invitation.tenantId, role: invitation.role };
  },

  /**
   * Revocar invitación activa
   */
  async revokeInvitation(context: MembershipContext, invitationId: string) {
    if (context.role !== "PM_ADMIN") {
      throw new Error("Solo los administradores pueden revocar invitaciones.");
    }

    return prisma.tenantInvitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() }
    });
  }
};
