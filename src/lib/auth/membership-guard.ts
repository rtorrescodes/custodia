import { z } from "zod";
import { prisma } from "@/lib/prisma";

export type CanonicalMemberRole = 
  | "PM_ADMIN" 
  | "PM_STAFF" 
  | "LANDLORD" 
  | "OWNER" 
  | "RENTER" 
  | "VENDOR";

export type CanonicalMemberStatus = 
  | "ACTIVE" 
  | "INVITED" 
  | "SUSPENDED" 
  | "REVOKED";

export interface MembershipContext {
  userId: string;
  userEmail: string;
  tenantId: string;
  membershipId: string;
  role: CanonicalMemberRole;
  status: CanonicalMemberStatus;
  allowedPortfolioIds?: string[];
}

export type PermissionAction = 
  | "VIEW_PROPERTIES"
  | "CREATE_PROPERTY"
  | "EDIT_PROPERTY"
  | "ARCHIVE_PROPERTY"
  | "VIEW_LEASES"
  | "MANAGE_LEASES"
  | "VIEW_FINANCES"
  | "MANAGE_FINANCES"
  | "MANAGE_TEAM"
  | "VIEW_OWNER_PORTAL"
  | "VIEW_VENDOR_TASKS";

const ROLE_PERMISSIONS: Record<CanonicalMemberRole, PermissionAction[]> = {
  PM_ADMIN: [
    "VIEW_PROPERTIES",
    "CREATE_PROPERTY",
    "EDIT_PROPERTY",
    "ARCHIVE_PROPERTY",
    "VIEW_LEASES",
    "MANAGE_LEASES",
    "VIEW_FINANCES",
    "MANAGE_FINANCES",
    "MANAGE_TEAM",
    "VIEW_OWNER_PORTAL",
    "VIEW_VENDOR_TASKS"
  ],
  PM_STAFF: [
    "VIEW_PROPERTIES",
    "EDIT_PROPERTY",
    "VIEW_LEASES",
    "VIEW_FINANCES",
    "VIEW_VENDOR_TASKS"
  ],
  LANDLORD: [
    "VIEW_PROPERTIES",
    "CREATE_PROPERTY",
    "EDIT_PROPERTY",
    "ARCHIVE_PROPERTY",
    "VIEW_LEASES",
    "MANAGE_LEASES",
    "VIEW_FINANCES",
    "MANAGE_FINANCES",
    "VIEW_VENDOR_TASKS"
  ],
  OWNER: [
    "VIEW_PROPERTIES",
    "VIEW_LEASES",
    "VIEW_FINANCES",
    "VIEW_OWNER_PORTAL"
  ],
  RENTER: [
    "VIEW_LEASES"
  ],
  VENDOR: [
    "VIEW_VENDOR_TASKS"
  ]
};

/**
 * Validador de Autorización en Servidor (Zero Trust).
 * Verifica que el usuario tenga una membresía activa en el tenant solicitado
 * y que cuente con las facultades necesarias.
 */
export async function resolveMembershipContext(
  userId: string,
  targetTenantId: string
): Promise<{ ok: true; context: MembershipContext } | { ok: false; error: string; code: 401 | 403 }> {
  if (!userId || !targetTenantId) {
    return { ok: false, error: "Identidad o Tenant no provistos.", code: 401 };
  }

  // 1. Buscar membresía explícita
  const membership = await prisma.tenantMember.findUnique({
    where: {
      tenantId_userId: {
        tenantId: targetTenantId,
        userId: userId
      }
    },
    include: {
      user: true,
      portfolioAccesses: true
    }
  });

  if (membership) {
    if (membership.status === "REVOKED") {
      return { ok: false, error: "La membresía en esta organización ha sido revocada.", code: 403 };
    }
    if (membership.status === "SUSPENDED") {
      return { ok: false, error: "La membresía en esta organización está suspendida.", code: 403 };
    }

    return {
      ok: true,
      context: {
        userId,
        userEmail: membership.user.email,
        tenantId: targetTenantId,
        membershipId: membership.id,
        role: membership.role as CanonicalMemberRole,
        status: membership.status as CanonicalMemberStatus,
        allowedPortfolioIds: membership.portfolioAccesses.map(p => p.portfolioId)
      }
    };
  }

  // 2. Fallback de retrocompatibilidad con User.tenantId previo (antes de migración de membresías)
  const legacyUser = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId: targetTenantId
    }
  });

  if (!legacyUser) {
    return { ok: false, error: "El usuario no pertenece a la organización especificada.", code: 403 };
  }

  // Mapear rol legado a rol canónico de membresía
  const roleMap: Record<string, CanonicalMemberRole> = {
    SUPER_ADMIN: "PM_ADMIN",
    ADMIN: "PM_ADMIN",
    MANAGER: "PM_STAFF",
    STAFF: "PM_STAFF",
    OWNER: "OWNER",
    RENTER: "RENTER",
    VENDOR: "VENDOR"
  };

  return {
    ok: true,
    context: {
      userId,
      userEmail: legacyUser.email,
      tenantId: targetTenantId,
      membershipId: `legacy-${legacyUser.id}`,
      role: roleMap[legacyUser.role] || "LANDLORD",
      status: "ACTIVE"
    }
  };
}

/**
 * Validador de permisos específicos
 */
export function hasPermission(
  role: CanonicalMemberRole,
  permission: PermissionAction
): boolean {
  const allowed = ROLE_PERMISSIONS[role] || [];
  return allowed.includes(permission);
}

/**
 * Validador de acceso a una propiedad específica
 */
export async function canAccessProperty(
  context: MembershipContext,
  propertyId: string,
  permission: PermissionAction
): Promise<{ allowed: boolean; reason?: string }> {
  if (!hasPermission(context.role, permission)) {
    return { allowed: false, reason: `Rol ${context.role} no cuenta con la facultad ${permission}.` };
  }

  // Verificar pertenencia del recurso al tenant
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      tenantId: context.tenantId
    },
    include: {
      owners: true
    }
  });

  if (!property) {
    return { allowed: false, reason: "Inmueble no encontrado en la organización activa." };
  }

  // Si es un propietario (OWNER), verificar que esté listado como dueño de esta propiedad
  if (context.role === "OWNER") {
    const isOwner = property.owners.some(o => o.userId === context.userId);
    if (!isOwner) {
      return { allowed: false, reason: "Propietario no autorizado para acceder a este inmueble específico." };
    }
  }

  // Si tiene restricción de carteras (PM_STAFF con carteras asignadas)
  if (context.allowedPortfolioIds && context.allowedPortfolioIds.length > 0 && property.portfolioId) {
    if (!context.allowedPortfolioIds.includes(property.portfolioId)) {
      return { allowed: false, reason: "El usuario no tiene acceso a la cartera que contiene este inmueble." };
    }
  }

  return { allowed: true };
}
