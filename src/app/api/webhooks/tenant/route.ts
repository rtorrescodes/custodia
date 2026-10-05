import { NextResponse } from "next/server"
import { webhookService } from "@/lib/services/webhook-service"

// Receptor durable para cobranza de rentas (Stripe Connect / MercadoPago / STP) (CUS-03B)
export async function POST(req: Request) {
  try {
    const payload = await req.json()
    const signature = req.headers.get("stripe-signature") || undefined;
    
    const eventType = payload.type || payload.eventType || "unknown";
    const externalId = payload.id || `ext_${Date.now()}`;
    const tenantId = payload.data?.object?.metadata?.tenantId || payload.metadata?.tenantId || payload.tenantId;

    if (!tenantId) {
      return NextResponse.json({ error: "Falta tenantId en metadata del webhook" }, { status: 400 });
    }

    const result = await webhookService.ingestAndProcess({
      tenantId,
      provider: "STRIPE",
      externalId,
      eventType,
      payload,
      signature,
    });

    return NextResponse.json({ received: true, ...result })
  } catch (error: any) {
    console.error("Webhook processing error:", error)
    return NextResponse.json({ error: "Webhook Error", message: error.message }, { status: 400 })
  }
}
