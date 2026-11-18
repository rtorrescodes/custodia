import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { MembershipContext } from "@/lib/auth/membership-guard";

export const propertyCsvRowSchema = z.object({
  name: z.string().min(2, "El nombre de la unidad es requerido"),
  address: z.string().min(5, "La dirección completa es requerida"),
  managementType: z.enum(["OWNED", "THIRD_PARTY"]).default("OWNED"),
  fundCustodian: z.enum(["LANDLORD", "PM_ESCROW", "DIRECT_OWNER"]).default("LANDLORD"),
  unitNumber: z.string().optional(),
  ownerEmail: z.string().email().optional(),
  initialBalance: z.number().optional() // Solo advertencia, no inventa pagos
});

export type PropertyCsvRow = z.infer<typeof propertyCsvRowSchema>;

export interface CsvImportOptions {
  mode: "ATOMIC" | "PARTIAL";
}

export interface CsvImportResult {
  totalProcessed: number;
  createdCount: number;
  rejectedCount: number;
  duplicatesCount: number;
  warnings: string[];
  errors: { row: number; item: string; reason: string }[];
  importedIds: string[];
}

export const csvImportService = {
  /**
   * Procesa e importa un lote de filas CSV validadas
   */
  async importProperties(
    context: MembershipContext,
    rows: any[],
    options: CsvImportOptions = { mode: "PARTIAL" }
  ): Promise<CsvImportResult> {
    if (context.role !== "PM_ADMIN" && context.role !== "LANDLORD") {
      throw new Error("No tienes autorización para importar propiedades.");
    }

    const MAX_ROWS = 500;
    if (rows.length > MAX_ROWS) {
      throw new Error(`El archivo supera el límite máximo permitido de ${MAX_ROWS} filas por lote.`);
    }

    const result: CsvImportResult = {
      totalProcessed: rows.length,
      createdCount: 0,
      rejectedCount: 0,
      duplicatesCount: 0,
      warnings: [],
      errors: [],
      importedIds: []
    };

    // 1. Detección de duplicados internos dentro del mismo CSV
    const seenNames = new Set<string>();
    const validatedRows: { index: number; data: PropertyCsvRow }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rawRow = rows[i];
      const parseResult = propertyCsvRowSchema.safeParse(rawRow);

      if (!parseResult.success) {
        result.rejectedCount++;
        result.errors.push({
          row: i + 1,
          item: rawRow?.name || `Fila ${i + 1}`,
          reason: parseResult.error.issues.map(e => e.message).join(", ")
        });
        continue;
      }

      const rowData = parseResult.data;
      const lowerName = rowData.name.trim().toLowerCase();

      if (seenNames.has(lowerName)) {
        result.duplicatesCount++;
        result.rejectedCount++;
        result.errors.push({
          row: i + 1,
          item: rowData.name,
          reason: "Unidad duplicada dentro del mismo archivo CSV."
        });
        continue;
      }

      seenNames.add(lowerName);

      if (rowData.initialBalance && rowData.initialBalance !== 0) {
        result.warnings.push(
          `Fila ${i + 1} (${rowData.name}): El saldo inicial ($${rowData.initialBalance}) se reservó como nota contable informativa. No se generaron transacciones ficticias sin comprobante bancario (Políticas CUS-01 / CUS-02).`
        );
      }

      validatedRows.push({ index: i + 1, data: rowData });
    }

    // Si el modo es ATOMIC y hubo algún error, abortar sin escribir nada
    if (options.mode === "ATOMIC" && result.errors.length > 0) {
      throw new Error(
        `IMPORTACIÓN ATÓMICA RECHAZADA: Se encontraron ${result.errors.length} errores en el archivo. No se escribió ninguna propiedad.`
      );
    }

    // 2. Comprobar duplicados contra la base de datos para este tenant
    const existingProperties = await prisma.property.findMany({
      where: { tenantId: context.tenantId },
      select: { name: true }
    });
    const existingNamesSet = new Set(existingProperties.map(p => p.name.trim().toLowerCase()));

    // 3. Ejecutar inserción
    for (const { index, data } of validatedRows) {
      const lowerName = data.name.trim().toLowerCase();
      if (existingNamesSet.has(lowerName)) {
        result.duplicatesCount++;
        result.rejectedCount++;
        result.errors.push({
          row: index,
          item: data.name,
          reason: "Ya existe una propiedad registrada con este nombre en la organización."
        });
        if (options.mode === "ATOMIC") {
          throw new Error(
            `IMPORTACIÓN ATÓMICA RECHAZADA: La propiedad '${data.name}' ya existe en la organización.`
          );
        }
        continue;
      }

      // Si incluye email de propietario, buscar o registrar referencia
      let ownerUser = null;
      if (data.ownerEmail) {
        ownerUser = await prisma.user.findFirst({
          where: { tenantId: context.tenantId, email: data.ownerEmail }
        });
      }

      const created = await prisma.property.create({
        data: {
          tenantId: context.tenantId,
          name: data.name,
          address: data.address,
          managementType: data.managementType,
          fundCustodian: data.fundCustodian,
          unitNumber: data.unitNumber || null,
          isUnit: !!data.unitNumber,
          owners: ownerUser ? {
            create: {
              userId: ownerUser.id,
              ownershipShare: 100.00
            }
          } : undefined
        }
      });

      result.createdCount++;
      result.importedIds.push(created.id);
      existingNamesSet.add(lowerName);
    }

    return result;
  }
};
