import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';
import type { User } from '@supabase/supabase-js';

export interface VerifiedIdentity {
  user: User;
  userId: string;
  userEmail: string;
}

/**
 * Cliente SSR de Supabase para operaciones en contexto de solicitud.
 */
export async function getSSRClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Silencioso en Server Components
          }
        },
      },
    }
  );
}

/**
 * Validador de Identidad Criptográfica SSR (Zero Trust).
 *
 * Utiliza `supabase.auth.getUser()`, el cual verifica el token JWT contra el
 * servidor de autenticación de Supabase (GoTrue) y valida firma criptográfica,
 * claims y expiración.
 *
 * - No confía en `getSession().user` como autoridad de identidad.
 * - Rechaza tokens manipulados, firmas corruptas o JWTs vencidos.
 * - React `cache()` memoriza el resultado ÚNICAMENTE durante el ciclo de vida
 *   de la solicitud HTTP actual, evitando consultas GoTrue redundantes sin
 *   compartir estado entre usuarios concurrentes.
 * - Cero fallbacks a identidades sintéticas o usuarios demo ficticios.
 */
export const getVerifiedIdentity = cache(async (): Promise<VerifiedIdentity | null> => {
  try {
    const supabase = await getSSRClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      return null;
    }

    return {
      user: data.user,
      userId: data.user.id,
      userEmail: data.user.email || '',
    };
  } catch (err) {
    console.error('Error verificando identidad SSR en GoTrue:', err);
    return null;
  }
});
