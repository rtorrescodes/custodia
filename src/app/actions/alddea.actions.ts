"use server"

import { checkAlddeaFeatures, generateAlddeaQR } from "@/lib/services/alddea-bridge";
import { getSessionAndTenant } from "@/lib/services/queries";

export async function generateQrAction(alddeaId: string, visitorName: string) {
  const { session } = await getSessionAndTenant();
  
  if (!session?.user?.email) {
    return { success: false, error: "Usuario no autenticado" };
  }

  try {
    const features = await checkAlddeaFeatures(alddeaId);
    if (!features.canGenerateQR) {
      return { success: false, error: "Esta propiedad no tiene habilitada la generación de QRs en Alddea." };
    }

    const res = await generateAlddeaQR(alddeaId, session.user.email, {
      visitorName,
      validHours: 24,
      passType: "VISITOR"
    });

    return { success: true, data: res };
  } catch (error: any) {
    console.error("generateQrAction error:", error);
    return { success: false, error: error.message };
  }
}
