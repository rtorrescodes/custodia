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
    return { error: 'Credenciales inválidas.' }
  }

  // Si el usuario tiene tenant asociado, inicializar la cookie activa con su tenant oficial
  const { data: { session } } = await supabase.auth.getSession()
  const defaultTenantId = session?.user?.app_metadata?.tenantId || session?.user?.user_metadata?.tenantId
  if (defaultTenantId) {
    cookieStore.set('custodia_active_tenant', defaultTenantId, { path: '/' })
  }

  redirect('/')
}
