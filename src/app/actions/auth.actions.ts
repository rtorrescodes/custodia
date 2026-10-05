"use server"

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const cookieStore = await cookies()

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
          } catch {}
        },
      },
    }
  )

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    // Si estamos en entorno de desarrollo local y es un usuario demo sintético válido, permitir sesión local segura
    if (process.env.NODE_ENV !== 'production' && email.endsWith('@demo.custodia.app')) {
      const { prisma } = await import('@/lib/prisma');
      const dbUser = await prisma.user.findFirst({
        where: { email },
        include: { tenant: true }
      });
      if (dbUser) {
        cookieStore.set('custodia_dev_user', dbUser.email, { path: '/' });
        cookieStore.set('custodia_active_tenant', dbUser.tenantId, { path: '/' });
        redirect('/');
      }
    }
    return { error: 'Credenciales inválidas.' }
  }

  // Limpiar cookies de desarrollo si login oficial fue exitoso
  cookieStore.delete('custodia_dev_user');
  redirect('/')
}
