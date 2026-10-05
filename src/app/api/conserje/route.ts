import { NextResponse } from "next/server"
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { prisma } from "@/lib/prisma"

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "mock-key"

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
          },
        },
      }
    );

    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const tenantId = session.user.app_metadata?.tenantId as string;
    const userId = session.user.id;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { addons: true }
    });

    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

    // Validate if CONSERJE_IA addon is active
    const hasConserje = tenant.addons.some(a => a.addon === "CONSERJE_IA" && a.isActive)
    if (!hasConserje) {
      // Return a soft message for the widget instead of 403
      return NextResponse.json({
        role: "assistant",
        content: "El administrador de la propiedad no tiene activo el módulo de Conserje Inteligente."
      });
    }

    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Mensajes inválidos" }, { status: 400 });
    }

    // Get user context
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        leases: {
          where: { status: "ACTIVE" },
          include: { property: true }
        }
      }
    });

    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    let propertyContext = "El usuario no tiene una propiedad asignada actualmente."
    if (user.leases.length > 0) {
      const lease = user.leases[0]
      propertyContext = `El usuario renta la propiedad: ${lease.property.name}. Renta: $${Number(lease.rentAmount)} ${lease.currency} los días ${lease.paymentDay} de cada mes.`
    }

    const systemPrompt = `
      Eres Rocío, el Conserje Virtual del fraccionamiento/empresa "${tenant.name}".
      Estás hablando con: ${user.email}.
      Contexto de su renta: ${propertyContext}
      
      REGLAS DE SEGURIDAD ESTRICTAS:
      1. NO TIENES ACCESO A LA BÓVEDA. Si el inquilino te pide claves de cerraduras, WiFi o códigos de seguridad, dile amablemente que tú (como IA) tienes prohibido acceder a la Bóveda por seguridad militar, y que el inquilino debe consultarlo directamente en su Panel de Control en la sección "Bóveda".
      2. Eres amable, concisa y profesional.
      3. Tu rol principal es dar información general, recordar fechas de pago y orientar sobre cómo levantar tickets de mantenimiento en el portal.
    `;

    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m: any) => ({
        role: m.role,
        content: m.content
      }))
    ];

    // Mock DeepSeek call if no real key
    if (DEEPSEEK_API_KEY === "mock-key") {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 800))
      
      const lastMessage = messages[messages.length - 1].content.toLowerCase();
      let responseContent = "¡Hola! Soy Rocío. Puedo ayudarte con dudas sobre tu renta o mantenimiento.";
      
      if (lastMessage.includes("clave") || lastMessage.includes("wifi") || lastMessage.includes("chapa")) {
        responseContent = "Por protocolos de seguridad Zero Trust, no tengo acceso a la bóveda de la propiedad. Por favor, consulta tus claves y códigos de cerradura directamente en la sección 'Bóveda' de tu portal.";
      } else if (lastMessage.includes("renta") || lastMessage.includes("pagar")) {
        responseContent = "Tu información de pagos está en el panel principal. Recuerda que puedes domiciliar tu tarjeta para que el cobro se haga de forma automática el día de pago.";
      } else if (lastMessage.includes("mantenimiento") || lastMessage.includes("foco") || lastMessage.includes("roto")) {
        responseContent = "Para reportar este problema, por favor dirígete a la sección de Mantenimiento en el menú lateral y levanta un ticket nuevo. El administrador lo recibirá de inmediato.";
      }

      return NextResponse.json({
        role: "assistant",
        content: responseContent
      });
    }

    // Real DeepSeek Integration (requires deepseek sdk or raw fetch)
    const completion = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: apiMessages,
        temperature: 0.3,
      })
    })

    const result = await completion.json()

    return NextResponse.json({
      role: "assistant",
      content: result.choices[0]?.message?.content || "Hubo un error de comunicación."
    });
  } catch (error: any) {
    console.error("Error en /api/conserje:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
