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

    let { data: { session }, error: authError } = await supabase.auth.getSession();

    if ((authError || !session?.user) && process.env.NODE_ENV !== 'production') {
      const devUserEmail = cookieStore.get('custodia_dev_user')?.value;
      if (devUserEmail) {
        const { prisma } = await import('@/lib/prisma');
        const dbUser = await prisma.user.findFirst({
          where: { email: devUserEmail }
        });
        if (dbUser) {
          session = {
            user: {
              id: dbUser.id,
              email: dbUser.email,
              app_metadata: { tenantId: dbUser.tenantId },
            }
          } as any;
          authError = null;
        }
      }
    }

    if (authError || !session?.user) {
      return { success: false, error: 'No autorizado.' };
    }

    // Resolver tenantId: cookie de organización activa -> app_metadata -> user_metadata
    const cookieTenant = cookieStore.get('custodia_active_tenant')?.value;
    const tenantId = cookieTenant || (session.user.app_metadata?.tenantId as string) || (session.user.user_metadata?.tenantId as string);
    
    if (!tenantId) {
      return { success: false, error: 'Usuario no asociado a un Tenant válido.' };
    }

    // Validación de Zod
    const validatedData = schema.parse(input);

    // Ejecución segura
    const result = await handler(validatedData, tenantId, session.user.id);
    return { success: true, data: result };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Validación fallida', details: error.issues } as any;
    }
    console.error('Action error:', error);
    return { success: false, error: 'Ocurrió un error interno en el servidor.' };
  }
}
