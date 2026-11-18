"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { safeAction } from "@/lib/auth/action-wrapper"
import { resolveMembershipContext } from "@/lib/auth/membership-guard"
import { onboardingService } from "@/lib/services/onboarding-service"
import { csvImportService } from "@/lib/services/csv-import-service"

const setModeSchema = z.object({
  mode: z.enum(["LANDLORD", "PROPERTY_MANAGER"])
})

export async function setOperatingModeAction(input: z.infer<typeof setModeSchema>) {
  return safeAction(setModeSchema, input, async ({ mode }, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) throw new Error(auth.error);

    const updated = await onboardingService.setOperatingMode(auth.context, mode);
    revalidatePath("/");
    return { tenant: updated };
  });
}

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["PM_ADMIN", "PM_STAFF", "OWNER", "RENTER", "VENDOR"]),
  expirationDays: z.number().min(1).max(30).optional()
})

export async function createInvitationAction(input: z.infer<typeof inviteSchema>) {
  return safeAction(inviteSchema, input, async (data, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) throw new Error(auth.error);

    const invitation = await onboardingService.createInvitation(auth.context, data);
    revalidatePath("/portal");
    return { invitation };
  });
}

const acceptInviteSchema = z.object({
  token: z.string().min(10)
})

export async function acceptInvitationAction(input: z.infer<typeof acceptInviteSchema>) {
  return safeAction(acceptInviteSchema, input, async ({ token }, _tenantId, userId) => {
    const result = await onboardingService.acceptInvitation(token, userId);
    revalidatePath("/");
    return result;
  });
}

const importCsvSchema = z.object({
  rows: z.array(z.any()),
  mode: z.enum(["ATOMIC", "PARTIAL"]).default("PARTIAL")
})

export async function importPropertiesCsvAction(input: z.infer<typeof importCsvSchema>) {
  return safeAction(importCsvSchema, input, async ({ rows, mode }, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) throw new Error(auth.error);

    const result = await csvImportService.importProperties(auth.context, rows, { mode });
    revalidatePath("/propiedades");
    return result;
  });
}
