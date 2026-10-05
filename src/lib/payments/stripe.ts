import { prisma } from "@/lib/prisma"

// MOCK: This file simulates the integration with Stripe / MercadoPago

export interface PaymentIntent {
  id: string
  clientSecret: string
  amount: number
  currency: string
  status: string
}

export const paymentsConfig = {
  getPlatformStripe: () => {
    // Return Stripe instance using process.env.STRIPE_SECRET_KEY
    // Used for charging Tenants (Property Managers) for SaaS usage.
    return {
      customers: {
        create: async (data: any) => ({ id: `cus_${Math.random().toString(36).substring(7)}` })
      },
      subscriptions: {
        create: async (data: any) => ({ id: `sub_${Math.random().toString(36).substring(7)}` })
      }
    }
  },

  getTenantStripe: async (tenantId: string) => {
    // 1. Fetch the Stripe Connect Account ID for this tenant from DB
    const integration = await prisma.tenantIntegration.findUnique({
      where: { tenantId_provider: { tenantId, provider: "STRIPE_CONNECT" } }
    })

    if (!integration || !integration.isActive) {
      throw new Error("El administrador no ha configurado Stripe Connect para cobrar rentas.")
    }

    const connectedAccountId = (integration.config as any)?.stripeAccountId

    if (!connectedAccountId) {
      throw new Error("Falta el Stripe Account ID del Tenant.")
    }

    // 2. Return a Stripe instance that acts ON BEHALF of the connected account
    // Example: const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { stripeAccount: connectedAccountId })
    return {
      paymentIntents: {
        create: async (data: any): Promise<PaymentIntent> => {
          return {
            id: `pi_${Math.random().toString(36).substring(7)}`,
            clientSecret: `pi_secret_${Math.random().toString(36).substring(7)}`,
            amount: data.amount,
            currency: data.currency,
            status: "requires_payment_method"
          }
        }
      }
    }
  }
}
