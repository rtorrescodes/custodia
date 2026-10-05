"use server"

import { z } from "zod"
import { safeAction } from "@/lib/auth/action-wrapper"
import { prisma } from "@/lib/prisma"

// MOCK: Basic encryption
const encrypt = (text: string) => Buffer.from(text).toString('base64')
const decrypt = (hash: string) => Buffer.from(hash, 'base64').toString('utf8')

const getVaultSchema = z.object({
  propertyId: z.string().uuid()
})

export async function getPropertyVault(input: z.infer<typeof getVaultSchema>) {
  return safeAction(getVaultSchema, input, async ({ propertyId }, tenantId, userId) => {
    
    // Check Authorization: Only PM, Owner, or Active Renter can see the vault
    const property = await prisma.property.findUnique({
      where: { id: propertyId, tenantId },
      include: {
        owners: { where: { userId } },
        leases: { where: { renterId: userId, status: "ACTIVE" } }
      }
    })

    if (!property) throw new Error("Property not found")

    // If user is not PM (owner of tenant) and not owner of property and not active renter...
    // For simplicity, we assume PM checks are handled by tenantId matching, but we need to ensure the user is STAFF/MANAGER or OWNER/RENTER
    const user = await prisma.user.findUnique({ where: { id: userId } })
    
    const isManager = user?.role === "MANAGER" || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN"
    const isOwner = property.owners.length > 0
    const isRenter = property.leases.length > 0

    if (!isManager && !isOwner && !isRenter) {
      throw new Error("Unauthorized to access this property vault")
    }

    const vaults = await prisma.propertyVault.findMany({
      where: { propertyId }
    })

    return vaults.map(v => ({
      ...v,
      keyValue: decrypt(v.keyValue) // Decrypt before sending to authorized client
    }))
  })
}

const addVaultSchema = z.object({
  propertyId: z.string().uuid(),
  type: z.enum(["WIFI", "SMART_LOCK", "ALARM", "LOCKBOX", "OTHER"]),
  keyName: z.string(),
  keyValue: z.string(),
  instructions: z.string().optional()
})

export async function addVaultEntry(input: z.infer<typeof addVaultSchema>) {
  return safeAction(addVaultSchema, input, async (data, tenantId, userId) => {
    // Only PM or Owner can ADD to vault
    const property = await prisma.property.findUnique({
      where: { id: data.propertyId, tenantId },
      include: { owners: { where: { userId } } }
    })

    if (!property) throw new Error("Property not found")

    const user = await prisma.user.findUnique({ where: { id: userId } })
    const isManager = user?.role === "MANAGER" || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN"
    const isOwner = property.owners.length > 0

    if (!isManager && !isOwner) {
      throw new Error("Only managers or owners can add secrets to the vault")
    }

    const newVault = await prisma.propertyVault.create({
      data: {
        propertyId: data.propertyId,
        type: data.type,
        keyName: data.keyName,
        keyValue: encrypt(data.keyValue), // Encrypt before DB
        instructions: data.instructions
      }
    })

    return { vault: newVault }
  })
}
