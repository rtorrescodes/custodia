export interface TranslationResult {
  translated: string;
  sourceLang: "es" | "en";
  targetLang: "es" | "en";
  status: "TRANSLATED_AI" | "NOT_AVAILABLE" | "ERROR";
  isAiGenerated: boolean;
  provider: string;
}

// Cache en memoria para deduplicar traducciones idénticas durante navegación/recarga
const translationCache = new Map<string, TranslationResult>();

/**
 * Servicio de Traducción Honesta.
 * Cumple estrictamente con la regla A2:
 * - Si no hay proveedor real habilitado (o es mock-key), NUNCA sustituye palabras simulando ser IA.
 * - Muestra el texto original y declara explícitamente status = "NOT_AVAILABLE".
 * - Preserva original, idiomas de origen/destino, estado y procedencia.
 * - Deduplica peticiones idénticas evitando llamadas innecesarias.
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

  // Deduplicación en memoria
  const cacheKey = `${detectedSource}->${targetLang}:${clean}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const isRealProviderConfigured = apiKey && apiKey !== "mock-key" && !apiKey.startsWith("mock-");

  // Si no hay proveedor configurado, devolver original con honestidad
  if (!isRealProviderConfigured) {
    const result: TranslationResult = {
      translated: clean, // Preserva original íntegro
      sourceLang: detectedSource,
      targetLang,
      status: "NOT_AVAILABLE",
      isAiGenerated: false,
      provider: "none",
    };
    translationCache.set(cacheKey, result);
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
    translationCache.set(cacheKey, result);
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
