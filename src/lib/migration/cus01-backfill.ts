import { prisma } from "@/lib/prisma";

export interface BackfillReport {
  timestamp: string;
  tenantsUpdated: number;
  membershipsCreated: number;
  propertiesUpdated: number;
  portfoliosCreated: number;
  errors: string[];
}

/**
 * Script de migración aditiva y backfill de compatibilidad (CUS-01).
 * Garantiza que toda la base de datos preexistente adopte el nuevo modelo
 * de membresías múltiples y carteras sin alterar ni perder registros existentes.
 */
export async function runCus01Backfill(): Promise<BackfillReport> {
  const report: BackfillReport = {
    timestamp: new Date().toISOString(),
    tenantsUpdated: 0,
    membershipsCreated: 0,
    propertiesUpdated: 0,
    portfoliosCreated: 0,
    errors: []
  };

  try {
    // 1. Obtener todos los tenants
    const tenants = await prisma.tenant.findMany({
      include: {
        users: true,
        properties: true
      }
    });

    for (const tenant of tenants) {
      // 1.1 Asegurar cartera general por defecto si no existe
      let defaultPortfolio = await prisma.portfolio.findFirst({
        where: { tenantId: tenant.id, name: "Cartera General" }
      });

      if (!defaultPortfolio) {
        defaultPortfolio = await prisma.portfolio.create({
          data: {
            tenantId: tenant.id,
            name: "Cartera General",
            description: "Cartera inicial generada por migración CUS-01"
          }
        });
        report.portfoliosCreated++;
      }

      // 1.2 Crear membresías para todos los usuarios preexistentes
      for (const user of tenant.users) {
        const existingMember = await prisma.tenantMember.findUnique({
          where: {
            tenantId_userId: {
              tenantId: tenant.id,
              userId: user.id
            }
          }
        });

        if (!existingMember) {
          // Mapeo seguro de UserRole legado a MemberRole
          let role: any = "LANDLORD";
          if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") role = "PM_ADMIN";
          else if (user.role === "MANAGER" || user.role === "STAFF") role = "PM_STAFF";
          else if (user.role === "OWNER") role = "OWNER";
          else if (user.role === "RENTER") role = "RENTER";
          else if (user.role === "VENDOR") role = "VENDOR";

          await prisma.tenantMember.create({
            data: {
              tenantId: tenant.id,
              userId: user.id,
              role,
              status: "ACTIVE"
            }
          });
          report.membershipsCreated++;
        }
      }

      // 1.3 Asignar cartera por defecto a propiedades que carezcan de ella
      for (const prop of tenant.properties) {
        if (!prop.portfolioId) {
          await prisma.property.update({
            where: { id: prop.id },
            data: {
              portfolioId: defaultPortfolio.id,
              managementType: prop.managementType || "PENDING_REVIEW",
              fundCustodian: prop.fundCustodian || "UNDETERMINED"
            }
          });
          report.propertiesUpdated++;
        }
      }

      report.tenantsUpdated++;
    }
  } catch (err: any) {
    report.errors.push(err.message || String(err));
  }

  return report;
}
