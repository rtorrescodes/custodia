"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { safeAction } from "@/lib/auth/action-wrapper"
import { prisma, withTenantRLS } from "@/lib/prisma"
import { resolveMembershipContext, canAccessProperty } from "@/lib/auth/membership-guard"
import { propertyService } from "@/lib/services/property-service"

const propertySchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  address: z.string().min(5, "La dirección debe ser más descriptiva"),
  fraccionamiento: z.string().optional(),
  alddeaId: z.string().optional(),
  portfolioId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  isUnit: z.boolean().optional(),
  unitNumber: z.string().optional(),
  managementType: z.enum(["OWNED", "THIRD_PARTY", "PENDING_REVIEW"]).optional(),
  fundCustodian: z.enum(["LANDLORD", "PM_ESCROW", "DIRECT_OWNER", "UNDETERMINED"]).optional(),
})

export async function createProperty(input: z.infer<typeof propertySchema>) {
  return safeAction(propertySchema, input, async (data, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) {
      throw new Error(auth.error);
    }

    const newProperty = await propertyService.createProperty(auth.context, {
      name: data.name,
      address: data.address,
      fraccionamiento: data.fraccionamiento,
      alddeaId: data.alddeaId,
      portfolioId: data.portfolioId,
      parentId: data.parentId,
      isUnit: data.isUnit,
      unitNumber: data.unitNumber,
      managementType: data.managementType,
      fundCustodian: data.fundCustodian,
    });

    revalidatePath("/propiedades");
    return { property: newProperty };
  });
}

const updatePropertySchema = z.object({
  id: z.string().uuid(),
  data: propertySchema,
})

export async function updateProperty(input: z.infer<typeof updatePropertySchema>) {
  return safeAction(updatePropertySchema, input, async ({ id, data }, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) {
      throw new Error(auth.error);
    }

    const access = await canAccessProperty(auth.context, id, "EDIT_PROPERTY");
    if (!access.allowed) {
      throw new Error(access.reason || "No tienes permiso para editar este inmueble.");
    }

    const updated = await prisma.property.update({
      where: { id },
      data: {
        name: data.name,
        address: data.address,
        fraccionamiento: data.fraccionamiento || null,
        alddeaId: data.alddeaId || null,
        portfolioId: data.portfolioId || null,
        parentId: data.parentId || null,
        isUnit: data.isUnit ?? false,
        unitNumber: data.unitNumber || null,
        managementType: data.managementType || "PENDING_REVIEW",
        fundCustodian: data.fundCustodian || "UNDETERMINED",
      }
    });

    revalidatePath("/propiedades");
    revalidatePath(`/propiedades/${id}`);
    return { property: updated };
  });
}

const archivePropertySchema = z.object({ id: z.string().uuid() })

export async function archiveProperty(input: z.infer<typeof archivePropertySchema>) {
  return safeAction(archivePropertySchema, input, async ({ id }, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) {
      throw new Error(auth.error);
    }

    const archived = await propertyService.archiveProperty(auth.context, id);
    revalidatePath("/propiedades");
    revalidatePath(`/propiedades/${id}`);
    return { property: archived };
  });
}

const deletePropertySchema = z.object({ id: z.string().uuid() })

export async function deleteProperty(input: z.infer<typeof deletePropertySchema>) {
  return safeAction(deletePropertySchema, input, async ({ id }, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) {
      throw new Error(auth.error);
    }

    // El servicio bloquea terminantemente si existen dependencias financieras u operativas
    await propertyService.deletePropertyHard(auth.context, id);

    revalidatePath("/propiedades");
    return { success: true };
  });
}

// -------------------------------------------------------------
// Generar Expediente de Entrega de Administración (Handoff Dossier)
// -------------------------------------------------------------
const generateHandoffDossierSchema = z.object({
  propertyId: z.string().uuid(),
})

export async function generateHandoffDossierAction(input: z.infer<typeof generateHandoffDossierSchema>) {
  return safeAction(generateHandoffDossierSchema, input, async ({ propertyId }, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) throw new Error(auth.error);

    const access = await canAccessProperty(auth.context, propertyId, "VIEW_PROPERTIES");
    if (!access.allowed) throw new Error(access.reason || "Sin acceso a la propiedad.");

    return prisma.$transaction(async (tx) => {
      const property = await tx.property.findUnique({
        where: { id: propertyId, tenantId },
        include: {
          owners: { include: { user: true } },
          leases: { where: { status: "ACTIVE" }, include: { renter: true } },
          workOrders: { orderBy: { createdAt: "desc" }, take: 20 },
          inspections: { orderBy: { inspectionDate: "desc" }, take: 10 },
          vaults: true,
          supplies: true,
        }
      });

      if (!property) throw new Error("Property not found");

      const { accountingService } = await import("@/lib/services/accounting-service");
      const fiduciary = await accountingService.getPropertyFiduciarySummary(tenantId, propertyId, tx);

      // CERO SECRETOS EN CLARO: Los secretos de bóveda se listan por tipo y nombre, jamás su valor sensible
      const sanitizedVaultEntries = property.vaults.map(v => ({
        id: v.id,
        keyName: v.keyName,
        type: v.type,
        instructions: v.instructions,
        isMasked: true,
        secretNote: "Clave bajo custodia segura. Requiere transferencia de credenciales independiente.",
      }));

      return {
        expedienteId: `DOSSIER-${property.id.slice(0, 8).toUpperCase()}`,
        generadoEn: new Date().toISOString(),
        generadoPor: userId,
        inmueble: {
          id: property.id,
          nombre: property.name,
          direccion: property.address,
          fraccionamiento: property.fraccionamiento,
          estadoOcupacion: property.occupancyStatus,
          tipoGestion: property.managementType,
          custodioFondos: property.fundCustodian,
        },
        propietarios: property.owners.map(o => ({
          email: o.user.email,
          participacion: Number(o.ownershipShare),
        })),
        arrendamientoActivo: property.leases[0] ? {
          inquilino: property.leases[0].renter.email,
          rentaMensual: Number(property.leases[0].rentAmount),
          moneda: property.leases[0].currency,
          diaPago: property.leases[0].paymentDay,
          inicio: property.leases[0].startDate.toISOString(),
          fin: property.leases[0].endDate.toISOString(),
        } : null,
        resumenFiduciario: {
          saldoNetoCustodiaPM: fiduciary.fondosNetosDueño,
          depositoGarantiaRetenido: fiduciary.depositosGarantiaRetenidos,
          reservaMinima: fiduciary.reservaMinimaContractual,
          compromisosOperativos: fiduciary.compromisosVigentes,
          disponibleReal: fiduciary.disponibleNuevasObligaciones,
          esDeficitario: fiduciary.esDeficitario,
        },
        inventarioSuministros: property.supplies.map(s => ({
          item: s.item,
          categoria: s.category,
          stockActual: s.currentStock,
          unidad: s.unit,
        })),
        ultimasInspecciones: property.inspections.map(i => ({
          tipo: i.type,
          fecha: i.inspectionDate.toISOString(),
          inspector: i.inspectorName,
          estado: i.status,
        })),
        bovedaDispositivos: sanitizedVaultEntries,
      };
    });
  });
}

// -------------------------------------------------------------
// 3. CUS-09C: Generar Informe Operativo de Valor para el Propietario
// -------------------------------------------------------------
const generatePerformanceReportSchema = z.object({
  propertyId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  language: z.enum(["es", "en"]).default("es"),
})

export async function generateOwnerPerformanceReportAction(data: z.infer<typeof generatePerformanceReportSchema>) {
  return safeAction(generatePerformanceReportSchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx: any) => {
      const property = await tx.property.findUnique({
        where: { id: input.propertyId, tenantId },
        include: {
          owners: { include: { user: true } },
          workOrders: {
            where: {
              updatedAt: { gte: new Date(input.periodStart), lte: new Date(input.periodEnd) },
              status: "COMPLETED",
            },
            include: { quotes: true, evidences: true }
          },
          inspections: {
            where: {
              inspectionDate: { gte: new Date(input.periodStart), lte: new Date(input.periodEnd) },
              status: "COMPLETED",
            }
          },
          supplies: {
            include: {
              movements: {
                where: {
                  createdAt: { gte: new Date(input.periodStart), lte: new Date(input.periodEnd) }
                }
              }
            }
          },
          contributions: {
            where: {
              createdAt: { gte: new Date(input.periodStart), lte: new Date(input.periodEnd) },
              status: "VERIFIED"
            }
          }
        }
      });

      if (!property) throw new Error("Property not found");

      const { accountingService } = await import("@/lib/services/accounting-service");
      const fiduciary = await accountingService.getPropertyFiduciarySummary(tenantId, property.id, tx);

      // Desglose de valor operativo
      const worksCompleted = property.workOrders.map((wo: any) => ({
        titulo: wo.title,
        categoria: wo.category,
        costoFinal: Number(wo.actualCost || wo.estimatedCost || 0),
        evidenciasCount: wo.evidences.length,
      }));

      const careVisitsCount = property.inspections.length;
      const totalSpent = worksCompleted.reduce((sum: number, w: any) => sum + w.costoFinal, 0);
      const totalContributed = property.contributions.reduce((sum: number, c: any) => sum + Number(c.amount), 0);

      const reportTitle = input.language === "en"
        ? `Executive Property Performance Report - ${property.name}`
        : `Informe Ejecutivo de Operación y Valor del Inmueble - ${property.name}`;

      return {
        reportId: `REP-VAL-${property.id.slice(0, 8).toUpperCase()}-${Date.now()}`,
        title: reportTitle,
        language: input.language,
        period: {
          start: input.periodStart,
          end: input.periodEnd,
        },
        property: {
          id: property.id,
          name: property.name,
          address: property.address,
          occupancyStatus: property.occupancyStatus,
          lastCareVisitAt: property.lastCareVisitAt?.toISOString() || null,
        },
        metricasClave: {
          trabajosMantenimientoRealizados: worksCompleted.length,
          visitasCuidadoEfectuadas: careVisitsCount,
          totalInversionMantenimiento: totalSpent,
          totalAportacionesVerificadas: totalContributed,
          saldoNetoEnCustodia: fiduciary.fondosNetosDueño,
          reservaContractualPreservada: fiduciary.reservaMinimaContractual,
        },
        trabajosDetallados: worksCompleted,
        insumosConsumidos: property.supplies.map((s: any) => ({
          item: s.item,
          unidad: s.unit,
          consumosPeriodo: s.movements.filter((m: any) => m.type === "OUTFLOW").reduce((acc: number, m: any) => acc + m.quantity, 0),
          stockActual: s.currentStock,
        })),
        generadoPor: userId,
        generadoEn: new Date().toISOString(),
      };
    });
  });
}

// -------------------------------------------------------------
// 4. CUS-09C: Entrega Formal de Administración (Handoff Inmueble)
// -------------------------------------------------------------
const executeHandoffSchema = z.object({
  propertyId: z.string().uuid(),
  outgoingManagerId: z.string().uuid(),
  incomingManagerId: z.string().uuid(),
  reason: z.string().min(5),
  rotationKeysRequired: z.array(z.string()).default([]), // IDs de secretos de bóveda que exigen rotación física
  observations: z.string().min(5),
})

export async function executePropertyHandoffAction(data: z.infer<typeof executeHandoffSchema>) {
  return safeAction(executeHandoffSchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx: any) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      const isManager = user?.role === "MANAGER" || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
      if (!isManager) {
        throw new Error("Solo los administradores pueden autorizar y ejecutar la entrega de administración.");
      }

      const property = await tx.property.findUnique({
        where: { id: input.propertyId, tenantId },
        include: {
          vaults: true,
          tasks: { where: { status: { in: ["PENDING", "IN_PROGRESS", "ASSIGNED"] } } }
        }
      });

      if (!property) throw new Error("Property not found");

      const now = new Date();

      // 1. Reasignar primaryManagerId en Property
      await tx.property.update({
        where: { id: property.id },
        data: {
          primaryManagerId: input.incomingManagerId,
        }
      });

      // 2. Reasignar tareas pendientes del administrador saliente al entrante
      let reassignedTasksCount = 0;
      for (const t of property.tasks) {
        if (t.assigneeId === input.outgoingManagerId) {
          await tx.operationalTask.update({
            where: { id: t.id },
            data: { assigneeId: input.incomingManagerId }
          });
          reassignedTasksCount++;
        }
      }

      // 3. Marcar credenciales que exigen rotación obligatoria
      const rotatedVaultIds: string[] = [];
      for (const vaultId of input.rotationKeysRequired) {
        const v = property.vaults.find((k: any) => k.id === vaultId);
        if (v) {
          await tx.propertyVault.update({
            where: { id: v.id },
            data: { isRotated: true, lastRotatedAt: now }
          });
          // Registrar auditoría de rotación
          await tx.vaultAccessAudit.create({
            data: {
              tenantId,
              vaultId: v.id,
              userId,
              action: "ROTATE",
            }
          });
          rotatedVaultIds.push(v.id);
        }
      }

      // 4. Crear acta formal de entrega en ContractDocument
      const handoffActa = await tx.contractDocument.create({
        data: {
          tenantId,
          leaseId: property.id, // o id de referencia
          type: "OTHER",
          title: `Acta de Entrega de Administración (Handoff) - ${property.name}`,
          metadata: {
            propertyId: property.id,
            outgoingManagerId: input.outgoingManagerId,
            incomingManagerId: input.incomingManagerId,
            reason: input.reason,
            observations: input.observations,
            tasksReassigned: reassignedTasksCount,
            keysRequiringRotation: rotatedVaultIds,
            executedBy: userId,
            executedAt: now.toISOString(),
          }
        }
      });

      return {
        handoffDocumentId: handoffActa.id,
        propertyId: property.id,
        newPrimaryManagerId: input.incomingManagerId,
        reassignedTasksCount,
        keysRotatedCount: rotatedVaultIds.length,
        status: "HANDOFF_EXECUTED",
      };
    });
  });
}

