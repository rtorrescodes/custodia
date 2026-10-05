"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Building2, Eye, EyeOff, ShieldCheck, Wallet, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { cn } from "@/lib/utils"

const features = [
  { icon: Building2, text: "Administra todas tus propiedades en un solo lugar" },
  { icon: Wrench, text: "Órdenes de trabajo y mantenimiento en tiempo real" },
  { icon: Wallet, text: "Trust accounting multi-moneda con total transparencia" },
]

export default function LoginPage() {
  const router = useRouter()
  const [modo, setModo] = useState<"login" | "registro">("login")
  const [verPass, setVerPass] = useState(false)

  const [error, setError] = useState<string | null>(null)

  async function clientAction(formData: FormData) {
    const { login } = await import('@/app/actions/auth.actions')
    const res = await login(formData)
    if (res?.error) setError(res.error)
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Cover panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(120% 120% at 100% 0%, oklch(0.62 0.24 300) 0%, transparent 55%), radial-gradient(100% 100% at 0% 100%, oklch(0.5 0.2 265) 0%, transparent 60%)",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-white/15">
            <Building2 className="size-5" />
          </div>
          <span className="text-xl font-bold">Ribera</span>
        </div>

        <div className="relative flex flex-col gap-6">
          <h1 className="max-w-md text-4xl font-bold leading-tight text-balance">
            La plataforma de administración de propiedades para equipos exigentes.
          </h1>
          <ul className="flex flex-col gap-4">
            {features.map((f) => (
              <li key={f.text} className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <f.icon className="size-4.5" />
                </div>
                <span className="text-sm text-primary-foreground/90">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-sm text-primary-foreground/80">
          <ShieldCheck className="size-4" />
          Cumplimiento SOC 2 y cifrado de extremo a extremo
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col gap-2">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground lg:hidden">
              <Building2 className="size-5" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {modo === "login" ? "Bienvenido de nuevo" : "Crea tu cuenta"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {modo === "login"
                ? "Ingresa tus credenciales para acceder a tu panel."
                : "Configura tu administrador seguro en segundos."}
            </p>
          </div>

          <form action={clientAction}>
            <FieldGroup>
              {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
              {modo === "registro" && (
                <Field>
                  <FieldLabel htmlFor="nombre">Nombre completo</FieldLabel>
                  <Input id="nombre" placeholder="Mariana Ríos" className="h-11 rounded-xl" required />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="email">Correo electrónico</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="tu@empresa.com"
                  className="h-11 rounded-xl"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={verPass ? "text" : "password"}
                    placeholder="••••••••"
                    className="h-11 rounded-xl pr-11"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setVerPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={verPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {verPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>

              {modo === "login" && (
                <div className="flex justify-end">
                  <Link href="#" className="text-sm font-medium text-primary hover:underline">
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
              )}

              <Button type="submit" className="h-11 w-full rounded-xl text-sm font-semibold">
                {modo === "login" ? "Iniciar sesión" : "Crear cuenta"}
              </Button>
            </FieldGroup>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">o continúa con</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="h-11 w-full rounded-xl">
            <GoogleIcon />
            Google
          </Button>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            {modo === "login" ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
            <button
              type="button"
              onClick={() => setModo((m) => (m === "login" ? "registro" : "login"))}
              className={cn("font-semibold text-primary hover:underline")}
            >
              {modo === "login" ? "Regístrate" : "Inicia sesión"}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}
