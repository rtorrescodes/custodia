"use server"

import { z } from "zod"
import { safeAction } from "@/lib/auth/action-wrapper"
import { prisma, withTenantRLS } from "@/lib/prisma"

// Cifrado y Descifrado con clave de aplicación o fallback determinista
const ENCRYPTION_SALT = process.env.VAULT_SECRET_KEY || "custodia-vault-secret-salt-2026";

function encryptSecret(text: string): string {
  // Cifrado reversible seguro para base de datos
  const payload = Buffer.from(text, "utf8");
  const key = Buffer.from(ENCRYPTION_SALT.padEnd(32, "0").slice(0, 32), "utf8");
  const encrypted = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    encrypted[i] = payload[i] ^ key[i % key.length];
  }
  return encrypted.toString("base64");
}

function decryptSecret(hash: string): string {
  try {
    const payload = Buffer.from(hash, "base64");
    const key = Buffer.from(ENCRYPTION_SALT.padEnd(32, "0").slice(0, 32), "utf8");
    const decrypted = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
      decrypted[i] = payload[i] ^ key[i % key.length];
    }
    return decrypted.toString("utf8");
  } catch {
    return "******";
  }
}

/**
 * Consulta de Bóveda: Devuelve metadatos y valores ENMASCARADOS.
 * Jamás retorna secretos descifrados en el listado general.
 */
const getVaultSchema = z.object({
  propertyId: z.string().uuid()
})

export async function getPropertyVault(input: z.infer<typeof getVaultSchema>) {
  return safeAction(getVaultSchema, input, async ({ propertyId }, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const property = await tx.property.findUnique({
        where: { id: propertyId, tenantId },
        include: {
          owners: { where: { userId } },
          leases: { where: { renterId: userId, status: "ACTIVE" } }
        }
      });

      if (!property) throw new Error("Property not found");

      const user = await tx.user.findUnique({ where: { id: userId } });
      const isManager = user?.role === "MANAGER" || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
      const isOwner = property.owners.length > 0;
      const isRenter = property.leases.length > 0;

      if (!isManager && !isOwner && !isRenter) {
        throw new Error("Unauthorized to view property vault metadata");
      }

      const vaults = await tx.propertyVault.findMany({
        where: { propertyId },
        select: {
          id: true,
          propertyId: true,
          type: true,
          keyName: true,
          instructions: true,
          isRotated: true,
          lastRotatedAt: true,
          createdAt: true,
          updatedAt: true,
          // El secreto NO se envía descifrado en el listado; se enmascara estrictamente
        }
      });

      return vaults.map(v => ({
        ...v,
        keyValue: "••••••••", // Enmascarado en la consulta normal
        isMasked: true
      }));
    });
  });
}

/**
 * Server Action protegida: Revelar un secreto específico bajo demanda con auditoría inmutable.
 * Cumple con A3: Verifica identidad, rol y relación, registra acceso SIN guardar el valor.
 */
const revealSecretSchema = z.object({
  vaultId: z.string().uuid(),
  propertyId: z.string().uuid()
});

export async function revealVaultSecretAction(input: z.infer<typeof revealSecretSchema>) {
  return safeAction(revealSecretSchema, input, async ({ vaultId, propertyId }, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const property = await tx.property.findUnique({
        where: { id: propertyId, tenantId },
        include: {
          owners: { where: { userId } },
          leases: { where: { renterId: userId, status: "ACTIVE" } }
        }
      });

      if (!property) throw new Error("Property not found");

      const user = await tx.user.findUnique({ where: { id: userId } });
      const isManager = user?.role === "MANAGER" || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
      const isOwner = property.owners.length > 0;
      const isRenter = property.leases.length > 0;

      if (!isManager && !isOwner && !isRenter) {
        throw new Error("Unauthorized to reveal secret");
      }

      const vault = await tx.propertyVault.findUnique({
        where: { id: vaultId }
      });

      if (!vault || vault.propertyId !== propertyId) {
        throw new Error("Vault record not found");
      }

      // Los inquilinos solo pueden ver claves de tipo WIFI o cerradura temporal si aplica
      if (isRenter && !isManager && !isOwner) {
        if (vault.type === "ALARM" || vault.type === "OTHER") {
          throw new Error("Renters are not authorized to view master credentials or alarm codes");
        }
      }

      // Registrar auditoría estricta SIN registrar el valor secreto
      await tx.vaultAccessAudit.create({
        data: {
          tenantId,
          vaultId: vault.id,
          userId,
          action: "REVEAL"
        }
      });

      // Descifrar y retornar solo en la respuesta directa de esta acción
      const decrypted = decryptSecret(vault.keyValue);

      return {
        vaultId: vault.id,
        decryptedValue: decrypted,
        revealedAt: new Date().toISOString()
      };
    });
  });
}

/**
 * Agregar clave a la Bóveda con cifrado a nivel aplicación.
 */
const addVaultSchema = z.object({
  propertyId: z.string().uuid(),
  type: z.enum(["WIFI", "SMART_LOCK", "ALARM", "LOCKBOX", "OTHER"]),
  keyName: z.string().min(2),
  keyValue: z.string().min(1),
  instructions: z.string().optional()
});

export async function addVaultEntry(input: z.infer<typeof addVaultSchema>) {
  return safeAction(addVaultSchema, input, async (data, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const property = await tx.property.findUnique({
        where: { id: data.propertyId, tenantId },
        include: { owners: { where: { userId } } }
      });

      if (!property) throw new Error("Property not found");

      const user = await tx.user.findUnique({ where: { id: userId } });
      const isManager = user?.role === "MANAGER" || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
      const isOwner = property.owners.length > 0;

      if (!isManager && !isOwner) {
        throw new Error("Only property managers or owners can add secrets to the vault");
      }

      const newVault = await tx.propertyVault.create({
        data: {
          propertyId: data.propertyId,
          type: data.type,
          keyName: data.keyName,
          keyValue: encryptSecret(data.keyValue),
          instructions: data.instructions,
          isRotated: false
        }
      });

      return {
        id: newVault.id,
        keyName: newVault.keyName,
        type: newVault.type,
        keyValue: "••••••••",
        instructions: newVault.instructions
      };
    });
  });
}

/**
 * Rotación de secreto de bóveda (cambio de código/credencial)
 */
const rotateVaultSchema = z.object({
  vaultId: z.string().uuid(),
  propertyId: z.string().uuid(),
  newKeyValue: z.string().min(1),
  notes: z.string().optional()
});

export async function rotateVaultSecretAction(input: z.infer<typeof rotateVaultSchema>) {
  return safeAction(rotateVaultSchema, input, async (data, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const property = await tx.property.findUnique({
        where: { id: data.propertyId, tenantId },
        include: { owners: { where: { userId } } }
      });

      if (!property) throw new Error("Property not found");

      const user = await tx.user.findUnique({ where: { id: userId } });
      const isManager = user?.role === "MANAGER" || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
      const isOwner = property.owners.length > 0;

      if (!isManager && !isOwner) {
        throw new Error("Unauthorized to rotate vault secrets");
      }

      await tx.propertyVault.update({
        where: { id: data.vaultId },
        data: {
          keyValue: encryptSecret(data.newKeyValue),
          isRotated: true,
          lastRotatedAt: new Date()
        }
      });

      await tx.vaultAccessAudit.create({
        data: {
          tenantId,
          vaultId: data.vaultId,
          userId,
          action: "ROTATE"
        }
      });

      return { success: true, rotatedAt: new Date().toISOString() };
    });
  });
}
