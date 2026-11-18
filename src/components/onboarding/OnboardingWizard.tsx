"use client"

import React, { useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { setOperatingModeAction } from "@/app/actions/onboarding.actions"
import { Building2, UserCheck, CheckCircle2, ArrowRight, ShieldCheck, KeyRound } from "lucide-react"

interface OnboardingWizardProps {
  initialMode: "LANDLORD" | "PROPERTY_MANAGER"
  hasUnits: boolean
  hasLeases: boolean
}

export function OnboardingWizard({ initialMode, hasUnits, hasLeases }: OnboardingWizardProps) {
  const [mode, setMode] = useState<"LANDLORD" | "PROPERTY_MANAGER">(initialMode)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSelectMode = async (selected: "LANDLORD" | "PROPERTY_MANAGER") => {
    try {
      setLoading(true)
      setMode(selected)
      const res = await setOperatingModeAction({ mode: selected })
      if (res.success) {
        setSaved(true)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 shadow-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <CardTitle className="text-base font-semibold">Configuración del Núcleo — Experiencia Bimodal</CardTitle>
          </div>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            Paso 1 de 4
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Custodia opera con un núcleo común y dos experiencias adaptadas. Selecciona cómo administrarás esta organización:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            onClick={() => !loading && handleSelectMode("LANDLORD")}
            className={`cursor-pointer rounded-2xl border p-5 flex flex-col gap-3 transition-all ${mode === "LANDLORD" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/40 bg-card"}`}
          >
            <div className="flex items-center justify-between">
              <div className="size-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <Building2 className="size-5" />
              </div>
              {mode === "LANDLORD" && <CheckCircle2 className="size-5 text-primary" />}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Casero / Inversionista Directo</h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Administras tus propias casas o departamentos. Vista simplificada enfocada en cobro puntual, contratos vigentes y reparaciones sin comisiones de terceros.
              </p>
            </div>
          </div>

          <div
            onClick={() => !loading && handleSelectMode("PROPERTY_MANAGER")}
            className={`cursor-pointer rounded-2xl border p-5 flex flex-col gap-3 transition-all ${mode === "PROPERTY_MANAGER" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/40 bg-card"}`}
          >
            <div className="flex items-center justify-between">
              <div className="size-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <UserCheck className="size-5" />
              </div>
              {mode === "PROPERTY_MANAGER" && <CheckCircle2 className="size-5 text-primary" />}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Property Manager Profesional</h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Administras carteras de terceros. Incluye gestión de propietarios, acuerdos de administración, delimitación de equipo por carteras y trust accounting fiduciario.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/60">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <KeyRound className="size-4 text-primary" />
            <span>El modo configura la navegación y formularios; no otorga titularidad de fondos ajenos.</span>
          </div>
          {saved && <span className="text-xs font-medium text-emerald-500">Guardado correctamente</span>}
        </div>
      </CardContent>
    </Card>
  )
}
