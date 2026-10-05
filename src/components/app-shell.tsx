"use client"

import type React from "react"
import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  Building2,
  Wrench,
  Wallet,
  Cable,
  Settings,
  Search,
  Bell,
  Menu,
  PanelLeftClose,
  ChevronDown,
  LogOut,
  UserRound,
  ShieldAlert,
  Inbox,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const nav = [
  { label: "Inicio", href: "/", icon: Home },
  { label: "Propiedades", href: "/propiedades", icon: Building2 },
  { label: "Cartera", href: "/cartera", icon: Inbox },
  { label: "Mantenimiento", href: "/mantenimiento", icon: Wrench },
  { label: "Finanzas", href: "/portal", icon: Wallet },
  { label: "Integraciones", href: "/integraciones", icon: Cable },
  { label: "Configuración", href: "/configuracion", icon: Settings },
]

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  if (href.startsWith("/propiedades")) return pathname.startsWith("/propiedades")
  return pathname === href || pathname.startsWith(href + "/")
}

function SidebarContent({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname()
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 items-center gap-3 px-5", collapsed && "justify-center px-0")}>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Building2 className="size-5" />
        </div>
        {!collapsed && <span className="text-lg font-bold tracking-tight text-foreground">Ribera</span>}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {nav.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                collapsed && "justify-center px-0",
                active
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="size-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="p-3">
        <div
          className={cn(
            "rounded-2xl border border-border/50 bg-accent/30 p-4 backdrop-blur-sm",
            collapsed && "flex justify-center bg-transparent border-transparent p-2",
          )}
        >
          {collapsed ? (
            <ShieldAlert className="size-5 text-primary" />
          ) : (
            <>
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Plan Enterprise</p>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Trust accounting ilimitado y soporte prioritario.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function AppShell({
  children,
  title,
  breadcrumb,
  usuario,
  alertas = 0,
}: {
  children: React.ReactNode
  title: string
  breadcrumb?: string
  usuario: { nombre: string; rol: string }
  alertas?: number
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const iniciales = usuario.nombre
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")

  return (
    <div className="flex min-h-svh bg-background selection:bg-primary/20">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 border-r border-sidebar-border bg-sidebar/80 backdrop-blur-xl transition-[width] duration-300 ease-in-out lg:block shadow-[1px_0_10px_rgba(0,0,0,0.02)] dark:shadow-none",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <SidebarContent collapsed={collapsed} />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-sidebar-border bg-sidebar shadow-2xl animate-in slide-in-from-left-full duration-300">
            <SidebarContent collapsed={false} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl transition-all md:px-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)] dark:shadow-none">
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setCollapsed((c) => !c)}
            aria-label="Colapsar menú"
          >
            <PanelLeftClose className={cn("size-5 transition-transform duration-300", collapsed && "rotate-180")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </Button>

          <div className="relative hidden max-w-md flex-1 md:block group">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input
              placeholder="Buscar propiedades, órdenes, dueños…"
              className="h-9 w-full rounded-full border-transparent bg-muted/80 pl-9 transition-all focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/30"
              aria-label="Buscar"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border/70 bg-muted/40 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  document.cookie = "custodia_lang=es; path=/; max-age=31536000"
                  window.location.reload()
                }}
                className="rounded-md px-2 py-1 text-foreground transition-all hover:bg-background/80"
                title="Español"
              >
                🇲🇽 ES
              </button>
              <button
                type="button"
                onClick={() => {
                  document.cookie = "custodia_lang=en; path=/; max-age=31536000"
                  window.location.reload()
                }}
                className="rounded-md px-2 py-1 text-muted-foreground transition-all hover:text-foreground hover:bg-background/80"
                title="English"
              >
                🇺🇸 EN
              </button>
            </div>

            <Button variant="ghost" size="icon" className="relative rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors" aria-label="Notificaciones">
              <Bell className="size-4.5" />
              {alertas > 0 && (
                <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-sm shadow-primary/30 ring-2 ring-background">
                  {alertas}
                </span>
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger className="ml-1 flex items-center gap-2.5 rounded-full p-1 pr-3 text-left transition-colors hover:bg-muted/80 ring-1 ring-border/50">
                <Avatar className="size-8 border border-border/50">
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {iniciales}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden leading-tight sm:block">
                  <p className="text-sm font-semibold text-foreground tracking-tight">{usuario.nombre}</p>
                </div>
                <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl border-border/60 shadow-lg shadow-black/5 dark:shadow-none animate-in fade-in-80 zoom-in-95 p-2">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{usuario.nombre}</p>
                    <p className="text-xs leading-none text-muted-foreground mt-1">
                      {usuario.rol}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border/60" />
                <DropdownMenuGroup>
                  <DropdownMenuItem className="rounded-lg cursor-pointer focus:bg-accent/80 transition-colors">
                    <UserRound className="size-4 mr-2 opacity-70" />
                    Perfil
                  </DropdownMenuItem>
                  <DropdownMenuItem className="rounded-lg cursor-pointer focus:bg-accent/80 transition-colors">
                    <Settings className="size-4 mr-2 opacity-70" />
                    Preferencias
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator className="bg-border/60" />
                <DropdownMenuItem className="rounded-lg cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10 transition-colors" render={<Link href="/login" />}>
                  <LogOut className="size-4 mr-2 opacity-70" />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 px-4 py-8 md:px-8 lg:px-10">
          <div className="mx-auto w-full max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-8 flex flex-col gap-1.5">
              {breadcrumb && (
                <div className="flex items-center text-sm font-medium text-muted-foreground/80">
                  <span className="hover:text-foreground transition-colors cursor-pointer">Panel</span>
                  <span className="mx-2 opacity-50">/</span>
                  <span className="text-foreground">{breadcrumb}</span>
                </div>
              )}
              <h1 className="text-3xl font-bold tracking-tight text-foreground text-balance">
                {title}
              </h1>
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
