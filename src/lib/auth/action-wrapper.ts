import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';

/**
 * Wrapper de Server Actions (Zero Trust).
 * 1. Verifica la sesión de Supabase Auth.
 * 2. Valida los argumentos con Zod.
 * 3. Ejecuta la acción pasando el tenantId seguro.
 */
export async function safeAction<TInput, TOutput>(
  schema: z.ZodSchema<TInput>,
  input: TInput,
  handler: (validatedData: TInput, tenantId: string, userId: string) => Promise<TOutput>
): Promise<{ success: boolean; data?: TOutput; error?: string }> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing user sessions.
            }
          },
        },
      }
    );

    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return { success: false, error: 'No autorizado. Sesión requerida.' };
    }

    // Resolver tenantId: cookie de organización activa -> app_metadata -> user_metadata
    const cookieTenant = cookieStore.get('custodia_active_tenant')?.value;
    const targetTenantId = cookieTenant || (session.user.app_metadata?.tenantId as string) || (session.user.user_metadata?.tenantId as string);
    
    if (!targetTenantId) {
      return { success: false, error: 'Usuario no asociado a un Tenant válido.' };
    }

    // Validación estricta de membresía en el servidor (Zero Trust)
    const { resolveMembershipContext } = await import('@/lib/auth/membership-guard');
    const authContext = await resolveMembershipContext(session.user.id, targetTenantId);
    if (!authContext.ok) {
      return { success: false, error: authContext.error };
    }

    // Validación de Zod
    const validatedData = schema.parse(input);

    // Ejecución segura
    const result = await handler(validatedData, targetTenantId, session.user.id);
    return { success: true, data: result };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Validación fallida', details: error.issues } as any;
    }
    console.error('Action error:', error);
    return { success: false, error: 'Ocurrió un error interno en el servidor.' };
  }
}
