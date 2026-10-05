import { createClient } from "@supabase/supabase-js"

const BUCKET_NAME = "evidence-vault"

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key, {
    auth: { persistSession: false }
  })
}

export interface UploadEvidenceResult {
  path: string
  sha256?: string
  mimeType: string
  sizeBytes: number
}

/**
 * Servicio de almacenamiento privado de evidencias.
 * Restringe archivos a 10MB y formatos PDF/JPG/PNG.
 * Almacena en la ruta aislada: {tenantId}/{propertyId}/{year}/{month}/{uniqueFilename}
 */
export const evidenceStorageService = {
  async uploadFile(params: {
    tenantId: string
    propertyId: string
    filename: string
    buffer: Buffer
    mimeType: string
  }): Promise<UploadEvidenceResult> {
    const { tenantId, propertyId, filename, buffer, mimeType } = params

    const allowedMime = ["image/jpeg", "image/png", "application/pdf"]
    if (!allowedMime.includes(mimeType)) {
      throw new Error(`Tipo de archivo no permitido: ${mimeType}. Formatos válidos: PDF, JPG, PNG.`)
    }

    const MAX_SIZE = 10 * 1024 * 1024 // 10MB
    if (buffer.length > MAX_SIZE) {
      throw new Error("El archivo excede el tamaño máximo permitido de 10 MB.")
    }

    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_")
    const storagePath = `${tenantId}/${propertyId}/${year}/${month}/${Date.now()}-${cleanFilename}`

    const supabase = getAdminClient()
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      })

    if (error) {
      console.error("Storage upload error:", error)
      throw new Error(`Error al persistir evidencia en almacenamiento privado: ${error.message}`)
    }

    return {
      path: storagePath,
      mimeType,
      sizeBytes: buffer.length,
    }
  },

  /**
   * Genera una URL firmada de lectura temporal (válida por 15 minutos).
   * Nunca entrega URLs públicas permanentes.
   */
  async getSignedViewUrl(storagePath: string, expiresInSeconds = 900): Promise<string> {
    if (!storagePath) return ""
    // Si viene una URL externa antigua, no es privada
    if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
      return storagePath
    }

    const supabase = getAdminClient()
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, expiresInSeconds)

    if (error || !data?.signedUrl) {
      console.error("Failed to create signed URL:", error)
      return ""
    }

    return data.signedUrl
  }
}
