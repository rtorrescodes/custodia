import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Endpoint para que OpenClaw (Agente Externo) ejecute herramientas dentro de Custodia
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    // En un escenario real, validaríamos el Bearer Token contra una tabla de AgentKeys o el config del TenantIntegration
    const token = authHeader.split("Bearer ")[1].trim()
    const integration = await prisma.tenantIntegration.findFirst({
      where: { provider: "OPENCLAW_AGENT", isActive: true } // MOCK validation
    })

    if (!integration && token !== "mock-openclaw-token") {
      return NextResponse.json({ error: "Token inválido o integración desactivada" }, { status: 401 })
    }

    const tenantId = integration?.tenantId || "mock-tenant-id"
    const { action, payload, userEmail } = await req.json()

    if (!action || !userEmail) {
      return NextResponse.json({ error: "Faltan parámetros (action, userEmail)" }, { status: 400 })
    }

    // Identify user in this tenant
    const user = await prisma.user.findFirst({
      where: { tenantId, email: userEmail },
      include: {
        leases: { where: { status: "ACTIVE" }, include: { property: true } },
        properties: { include: { property: true } } // Owners
      }
    })

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado en este ecosistema" }, { status: 404 })
    }

    // RPC Actions
    switch (action) {
      case "GET_LEDGER_BALANCE": {
        // Find property based on if they are owner or renter
        const propertyId = user.leases[0]?.propertyId || user.properties[0]?.propertyId
        if (!propertyId) return NextResponse.json({ error: "El usuario no tiene propiedades asignadas" }, { status: 400 })

        // Get outstanding transactions
        const txs = await prisma.transaction.findMany({
          where: { propertyId }
        })
        
        const balance = txs.reduce((acc, t) => acc + (t.type === "INCOME" ? Number(t.amount) : -Number(t.amount)), 0)

        return NextResponse.json({
          success: true,
          balance,
          currency: txs[0]?.currency || "MXN",
          message: `El saldo actual del Ledger es de $${balance}`
        })
      }

      case "REPORT_MAINTENANCE_TICKET": {
        const propertyId = user.leases[0]?.propertyId || user.properties[0]?.propertyId
        if (!propertyId) return NextResponse.json({ error: "Sin propiedad para reportar" }, { status: 400 })

        const ticket = await prisma.workOrder.create({
          data: {
            tenantId,
            propertyId,
            title: payload.title || "Reporte desde OpenClaw",
            description: payload.description,
            status: "PENDING"
          }
        })

        return NextResponse.json({
          success: true,
          ticketId: ticket.id,
          message: "Ticket de mantenimiento creado exitosamente."
        })
      }

      case "GET_PROPERTY_ACCESS_CODES": {
        // SECURITY REQUIREMENT: Only Owner, Active Renter, or PM can get codes.
        // AI Concierge explicitly told not to share this. If OpenClaw tries to call this, we MUST block it if OpenClaw is acting as a generic concierge.
        // BUT, if OpenClaw is securely authenticated ON BEHALF of the owner via WhatsApp, it could.
        // As per the user instruction: "El conserje no puede tener acceso a la boveda". 
        // We return a hard denial for the agent.
        
        return NextResponse.json({
          success: false,
          error: "SECURITY_VIOLATION: Los agentes IA no tienen permiso de acceder a la bóveda. El usuario debe consultarlo manualmente en su portal."
        }, { status: 403 })
      }

      case "GENERATE_QR": {
        const property = user.leases[0]?.property || user.properties[0]?.property
        if (!property) return NextResponse.json({ error: "El usuario no tiene propiedades asignadas" }, { status: 400 })

        if (!property.alddeaId) {
          return NextResponse.json({
            success: false,
            error: "La propiedad no está vinculada a Alddea. Usa el panel web para gestionar accesos físicos."
          }, { status: 403 })
        }

        // Dynamically import to avoid circular dependencies or weird edge cases
        const { checkAlddeaFeatures, generateAlddeaQR } = await import("@/lib/services/alddea-bridge");
        
        const features = await checkAlddeaFeatures(property.alddeaId);
        
        if (!features?.canGenerateQR) {
          return NextResponse.json({
            success: false,
            error: "La generación de QR no está disponible para esta propiedad."
          }, { status: 403 })
        }

        if (!features?.hasAgentEnabled) {
          return NextResponse.json({
            success: false,
            error: "El conserje IA no tiene permisos para generar QRs en el fraccionamiento. Por favor, usa la App de Custodia manualmente."
          }, { status: 403 })
        }

        const visitorName = payload.visitorName || "Visita IA";
        const res = await generateAlddeaQR(property.alddeaId, user.email, {
          visitorName,
          validHours: 24,
          passType: "VISITOR"
        });

        return NextResponse.json({
          success: true,
          qrCodeUrl: res.passUrl,
          message: `Pase QR generado exitosamente para ${visitorName}. Link: ${res.passUrl}`
        })
      }

      default:
        return NextResponse.json({ error: "Acción desconocida" }, { status: 400 })
    }

  } catch (error) {
    console.error("Error en /api/agent:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
