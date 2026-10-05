import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// MOCK: Webhook receptor for Rent Collection (Stripe Connect / MercadoPago)
export async function POST(req: Request) {
  try {
    const payload = await req.json()
    // En producción se valida el Webhook Signature
    
    switch (payload.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = payload.data.object
        
        // El PaymentIntent debe tener en sus metadatos el leaseId y propertyId
        const leaseId = paymentIntent.metadata?.leaseId
        const propertyId = paymentIntent.metadata?.propertyId
        const tenantId = paymentIntent.metadata?.tenantId

        if (leaseId && propertyId && tenantId) {
          // Registrar la transacción aprobada en el Ledger de Trust Accounting
          await prisma.transaction.create({
            data: {
              tenantId,
              propertyId,
              amount: paymentIntent.amount / 100, // asumiendo centavos
              currency: paymentIntent.currency.toUpperCase(),
              type: "INCOME",
              category: "RENTA",
              description: `Pago de Renta Automático - Contrato ${leaseId.substring(0, 8)}`,
              requiresApproval: false,
              isApproved: true,
            }
          })
        }
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "Webhook Error" }, { status: 400 })
  }
}
