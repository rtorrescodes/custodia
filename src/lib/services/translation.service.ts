import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export interface TranslationResult {
  translated: string;
  sourceLang: "es" | "en";
  targetLang: "es" | "en";
  status: "TRANSLATED_AI" | "NOT_AVAILABLE" | "ERROR";
  isAiGenerated: boolean;
  provider: string;
}

// Cache en memoria L1 para velocidad durante la sesión activa
const translationCache = new Map<string, TranslationResult>();

/**
 * Servicio de Traducción Honesta con Persistencia DB (CUS-09C Regla 6)
 * - Persistencia L2 en base de datos PostgreSQL (`TranslationRecord`) con hash SHA256.
 * - Deduplicación entre reinicios de procesos y workers sin consumir tokens adicionales.
 * - Si no hay proveedor real habilitado (o es mock-key), NUNCA sustituye palabras simulando ser IA.
 * - Muestra el texto original y declara explícitamente status = "NOT_AVAILABLE".
 * - Preserva original, idiomas de origen/destino, estado y procedencia.
 */
export async function translateText(
  text: string,
  targetLang: "es" | "en"
): Promise<TranslationResult> {
  const clean = text?.trim() || "";
  const detectedSource: "es" | "en" = targetLang === "en" ? "es" : "en";

  if (!clean) {
    return {
      translated: "",
      sourceLang: detectedSource,
      targetLang,
      status: "NOT_AVAILABLE",
      isAiGenerated: false,
      provider: "none",
    };
  }

  // Hash determinista para deduplicación L1 y L2
  const sourceHash = crypto
    .createHash("sha256")
    .update(`${detectedSource}:${targetLang}:${clean}`)
    .digest("hex");

  // 1. Verificación en memoria L1
  if (translationCache.has(sourceHash)) {
    return translationCache.get(sourceHash)!;
  }

  // 2. Verificación persistente en base de datos L2
  try {
    const existing = await prisma.translationRecord.findUnique({
      where: { sourceHash },
    });
    if (existing) {
      const persistedResult: TranslationResult = {
        translated: existing.translatedText,
        sourceLang: existing.sourceLang as "es" | "en",
        targetLang: existing.targetLang as "es" | "en",
        status: existing.status as any,
        isAiGenerated: existing.isAiGenerated,
        provider: existing.provider,
      };
      translationCache.set(sourceHash, persistedResult);
      return persistedResult;
    }
  } catch (dbErr) {
    // Si la BD no está disponible temporalmente, continuar al flujo principal
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const isRealProviderConfigured = apiKey && apiKey !== "mock-key" && !apiKey.startsWith("mock-");

  // Si no hay proveedor configurado, devolver original con honestidad y persistir
  if (!isRealProviderConfigured) {
    const result: TranslationResult = {
      translated: clean, // Preserva original íntegro
      sourceLang: detectedSource,
      targetLang,
      status: "NOT_AVAILABLE",
      isAiGenerated: false,
      provider: "none",
    };
    translationCache.set(sourceHash, result);

    try {
      await prisma.translationRecord.upsert({
        where: { sourceHash },
        update: {},
        create: {
          sourceHash,
          sourceLang: detectedSource,
          targetLang,
          originalText: clean,
          translatedText: clean,
          status: "NOT_AVAILABLE",
          provider: "none",
          isAiGenerated: false,
        },
      });
    } catch (_) {}

    return result;
  }

  // Llamada al proveedor real (DeepSeek Chat API)
  try {
    const prompt = targetLang === "en"
      ? `You are an expert bilingual property management translator. Translate faithfully from Spanish to English. Maintain numbers, dates and monetary units exactly. Return ONLY the translation:\n\n${clean}`
      : `Eres un traductor experto bilingüe en administración de propiedades. Traduce fielmente del inglés al español. Mantén números, fechas y monedas intactos. Devuelve ÚNICAMENTE la traducción:\n\n${clean}`;

    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(6000), // Timeout acotado de 6s
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const translatedText = data.choices?.[0]?.message?.content?.trim() || clean;

    const result: TranslationResult = {
      translated: translatedText,
      sourceLang: detectedSource,
      targetLang,
      status: "TRANSLATED_AI",
      isAiGenerated: true,
      provider: "deepseek-chat",
    };
    translationCache.set(sourceHash, result);

    try {
      await prisma.translationRecord.upsert({
        where: { sourceHash },
        update: {},
        create: {
          sourceHash,
          sourceLang: detectedSource,
          targetLang,
          originalText: clean,
          translatedText,
          status: "TRANSLATED_AI",
          provider: "deepseek-chat",
          isAiGenerated: true,
        },
      });
    } catch (_) {}

    return result;
  } catch (err: any) {
    console.warn("Fallo o timeout de DeepSeek, fallback honesto:", err?.message);
    const fallback: TranslationResult = {
      translated: clean,
      sourceLang: detectedSource,
      targetLang,
      status: "ERROR",
      isAiGenerated: false,
      provider: "deepseek-failed",
    };
    return fallback;
  }
}
