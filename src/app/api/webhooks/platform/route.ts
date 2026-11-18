import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// MOCK: Webhook receptor for Platform SaaS Billing
export async function POST(req: Request) {
  try {
    const payload = await req.json()
    // En producción se valida el Webhook Signature de Stripe
    // const signature = headers().get("Stripe-Signature")
    
    switch (payload.type) {
      case "customer.subscription.deleted":
      case "customer.subscription.past_due": {
        const stripeCustomerId = payload.data.object.customer
        
        // Disable the Tenant in our database
        await prisma.tenant.updateMany({
          where: { stripeCustomerId },
          data: { subscriptionStatus: "PAST_DUE" }
        })
        break
      }
      
      case "invoice.paid": {
        const stripeCustomerId = payload.data.object.customer
        
        // Reactivate the Tenant
        await prisma.tenant.updateMany({
          where: { stripeCustomerId },
          data: { subscriptionStatus: "ACTIVE" }
        })
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "Webhook Error" }, { status: 400 })
  }
}
