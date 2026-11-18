const ALDDEA_API_URL = process.env.ALDDEA_API_URL || "http://localhost:3000";
const CUSTODIA_API_KEY = process.env.CUSTODIA_API_KEY || "test-custodia-key-123";

export interface AlddeaFeatures {
  canGenerateQR: boolean;
  hasAgentEnabled: boolean;
}

export async function checkAlddeaFeatures(alddeaPropertyId: string): Promise<AlddeaFeatures> {
  try {
    const res = await fetch(`${ALDDEA_API_URL}/api/custodia-bridge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CUSTODIA_API_KEY}`
      },
      body: JSON.stringify({
        action: "CHECK_FEATURES",
        alddeaPropertyId
      }),
      cache: "no-store"
    });

    if (!res.ok) {
      let errMsg = "Error desconocido del servidor Alddea";
      try {
        const errorData = await res.json();
        errMsg = errorData.error || errMsg;
      } catch (e) {
        errMsg = `Alddea Bridge Error [${res.status}]`;
      }
      throw new Error(errMsg);
    }

    const data = await res.json();
    return data as AlddeaFeatures;
  } catch (error: any) {
    console.error("Failed to connect to Alddea Bridge:", error);
    throw new Error(error.message || "Error al conectar con Alddea");
  }
}

export async function generateAlddeaQR(
  alddeaPropertyId: string, 
  userEmail: string, 
  payload: { visitorName: string; validHours?: number; passType?: string }
) {
  try {
    const res = await fetch(`${ALDDEA_API_URL}/api/custodia-bridge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CUSTODIA_API_KEY}`
      },
      body: JSON.stringify({
        action: "GENERATE_QR",
        alddeaPropertyId,
        userEmail,
        payload
      })
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Failed to generate QR in Alddea");
    }

    return await res.json();
  } catch (error) {
    console.error("generateAlddeaQR Error:", error);
    throw error;
  }
}

export type AlddeaPass = {
  id: string;
  visitorName: string;
  passType: string;
  validFrom: string;
  validUntil: string;
  passUrl: string;
};

export async function getAlddeaPasses(alddeaPropertyId: string): Promise<AlddeaPass[]> {
  try {
    const res = await fetch(`${ALDDEA_API_URL}/api/custodia-bridge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CUSTODIA_API_KEY}`
      },
      body: JSON.stringify({
        action: "GET_PASSES",
        alddeaPropertyId
      }),
      cache: "no-store"
    });

    if (!res.ok) {
      console.error(`Alddea Bridge Error [${res.status}] on GET_PASSES`);
      return [];
    }

    const data = await res.json();
    return data.passes || [];
  } catch (error) {
    console.error("getAlddeaPasses Error:", error);
    return [];
  }
}
