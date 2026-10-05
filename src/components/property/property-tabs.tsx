"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Wrench,
  Receipt,
  CalendarDays,
  KeyRound,
  MessageSquareText,
  DollarSign,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Sparkles,
  Send,
  Plus,
  ShieldAlert,
  ArrowRight
} from "lucide-react"
import { getDictionary, Locale } from "@/lib/i18n"
import {
  createExpenseAction,
  approveQuoteAction,
  scheduleStayAction,
  addVaultKeyAction,
  sendChatMessageAction
} from "@/app/actions/property-operations.actions"

export function PropertyTabs({
  property,
  currentLang = "es"
}: {
  property: any;
  currentLang?: Locale;
}) {
  const [lang, setLang] = useState<Locale>(currentLang);
  const dict = getDictionary(lang).propertyDetail;

  // Estados locales para interactividad
  const [activeTab, setActiveTab] = useState("expenses");

  // Estado de Bóveda
  const [vaultKeys, setVaultKeys] = useState(property.boveda || []);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyType, setNewKeyType] = useState<"WIFI" | "SMART_LOCK" | "ALARM" | "LOCKBOX">("SMART_LOCK");
  const [newKeyValue, setNewKeyValue] = useState("");

  // Estado de Gastos
  const [orders, setOrders] = useState(property.ordenesConCotizacion || []);
  const [newExpenseTitle, setNewExpenseTitle] = useState("");
  const [newExpenseDesc, setNewExpenseDesc] = useState("");
  const [newExpenseCost, setNewExpenseCost] = useState("");
  const [loadingExpense, setLoadingExpense] = useState(false);

  // Estado de Llegadas / Estancias
  const [stays, setStays] = useState(property.estadias || []);
  const [stayGuestName, setStayGuestName] = useState("");
  const [stayDate, setStayDate] = useState("");
  const [stayNotes, setStayNotes] = useState("");

  // Estado de Chat PM-Dueño
  const [chatMessages, setChatMessages] = useState<any[]>(property.chat?.mensajes || []);
  const [msgInput, setMsgInput] = useState("");
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const [sendingMsg, setSendingMsg] = useState(false);

  // Handlers
  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!newExpenseTitle || !newExpenseCost) return;
    setLoadingExpense(true);
    const cost = parseFloat(newExpenseCost);
    const res = await createExpenseAction({
      propertyId: property.id,
      title: newExpenseTitle,
      description: newExpenseDesc || "Requerimiento reportado",
      estimatedCost: cost,
      laborCost: cost * 0.6,
      materialCost: cost * 0.4,
      priority: "MEDIUM",
    });
    if (res.success) {
      setOrders([
        {
          id: res.data?.workOrderId,
          titulo: newExpenseTitle,
          descripcion: newExpenseDesc,
          estado: "PENDING",
          costoEstimado: cost,
          costoReal: 0,
          requiereAprobacionOwner: cost > (property.acuerdo?.reservaMinima || 2000),
          cotizaciones: [{
            id: res.data?.quoteId,
            costoTotal: cost,
            estado: "SUBMITTED"
          }]
        },
        ...orders
      ]);
      setNewExpenseTitle("");
      setNewExpenseDesc("");
      setNewExpenseCost("");
    }
    setLoadingExpense(false);
  }

  async function handleApproveQuote(quoteId: string, orderId: string) {
    const res = await approveQuoteAction({ quoteId });
    if (res.success) {
      setOrders(orders.map((o: any) => {
        if (o.id === orderId) {
          return {
            ...o,
            estado: "IN_PROGRESS",
            cotizaciones: o.cotizaciones.map((q: any) => q.id === quoteId ? { ...q, estado: "APPROVED" } : q)
          };
        }
        return o;
      }));
    }
  }

  async function handleAddVaultKey(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName || !newKeyValue) return;
    const res = await addVaultKeyAction({
      propertyId: property.id,
      keyName: newKeyName,
      type: newKeyType,
      keyValue: newKeyValue,
      instructions: "Configurado desde el centro de mando",
    });
    if (res.success) {
      setVaultKeys([
        ...vaultKeys,
        {
          id: res.data?.vaultId,
          keyName: newKeyName,
          type: newKeyType,
          keyValue: newKeyValue,
          instructions: "Configurado desde el centro de mando",
        }
      ]);
      setNewKeyName("");
      setNewKeyValue("");
    }
  }

  async function handleScheduleStay(e: React.FormEvent) {
    e.preventDefault();
    if (!stayGuestName || !stayDate) return;
    const res = await scheduleStayAction({
      propertyId: property.id,
      inspectorName: stayGuestName,
      stayType: "MOVE_IN",
      arrivalDate: stayDate,
      notes: stayNotes,
      checklist: {
        limpieza: true,
        aireAcondicionado: true,
        sabanas: true,
      }
    });
    if (res.success) {
      setStays([
        {
          id: res.data?.inspectionId,
          tipo: "MOVE_IN",
          estado: "SCHEDULED",
          responsable: stayGuestName,
          fecha: new Date(stayDate).toISOString(),
          notas: stayNotes,
          checklist: { limpieza: true, aireAcondicionado: true },
        },
        ...stays
      ]);
      setStayGuestName("");
      setStayDate("");
      setStayNotes("");
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!msgInput.trim()) return;
    setSendingMsg(true);
    const contentToSend = msgInput;
    setMsgInput("");

    const targetLang = lang === "es" ? "en" : "es";
    const res = await sendChatMessageAction({
      threadId: property.chat?.threadId,
      content: contentToSend,
      senderName: "Administrador PM",
      senderRole: "PM_ADMIN",
      targetLang,
    });

    if (res.success) {
      setChatMessages([
        ...chatMessages,
        {
          id: res.data?.messageId || String(Date.now()),
          remitente: "Administrador PM",
          rol: "PM_ADMIN",
          contenido: res.data?.content,
          translated: res.data?.translated,
          fecha: new Date().toISOString(),
          esMio: true,
        }
      ]);
    }
    setSendingMsg(false);
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h3 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
          <Wrench className="size-5 text-primary" />
          {dict.tabs.operations}
        </h3>
        {/* Toggle bilingüe contextual */}
        <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-xl text-xs">
          <button
            onClick={() => setLang("es")}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              lang === "es" ? "bg-background shadow-xs text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            🇲🇽 ES
          </button>
          <button
            onClick={() => setLang("en")}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              lang === "en" ? "bg-background shadow-xs text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            🇺🇸 EN
          </button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 h-auto p-1 bg-muted/60 rounded-xl gap-1">
          <TabsTrigger value="expenses" className="text-xs py-2">
            <DollarSign className="size-3.5 mr-1" />
            {dict.tabs.expenses}
          </TabsTrigger>
          <TabsTrigger value="stays" className="text-xs py-2">
            <CalendarDays className="size-3.5 mr-1" />
            {dict.tabs.stays}
          </TabsTrigger>
          <TabsTrigger value="vault" className="text-xs py-2">
            <KeyRound className="size-3.5 mr-1" />
            {dict.tabs.vault}
          </TabsTrigger>
          <TabsTrigger value="chat" className="text-xs py-2">
            <MessageSquareText className="size-3.5 mr-1" />
            {dict.tabs.chat}
          </TabsTrigger>
          <TabsTrigger value="agreement" className="text-xs py-2">
            <Receipt className="size-3.5 mr-1" />
            {dict.tabs.agreement}
          </TabsTrigger>
        </TabsList>

        {/* ---------------- 1. GASTOS & APROBACIONES ---------------- */}
        <TabsContent value="expenses" className="space-y-4 pt-3">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2 border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dict.expensesTab.title}</CardTitle>
                <CardDescription className="text-xs">{dict.expensesTab.subtitle}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="size-4 text-amber-500 shrink-0" />
                    <span>
                      {dict.expensesTab.approvalThreshold}{" "}
                      <strong className="text-foreground">${property.acuerdo?.reservaMinima || 2000} MXN</strong>
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[11px] border-amber-500/40 text-amber-600">
                    Fondo de Reserva
                  </Badge>
                </div>

                <div className="space-y-3">
                  {orders.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No hay gastos reportados.</p>
                  ) : (
                    orders.map((o: any) => {
                      const quote = o.cotizaciones?.[0];
                      const isPendingApproval = quote?.estado === "SUBMITTED" && o.requiereAprobacionOwner;

                      return (
                        <div key={o.id} className="p-3.5 rounded-xl border border-border bg-card space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="font-semibold text-sm text-foreground">{o.titulo}</h4>
                              <p className="text-xs text-muted-foreground">{o.descripcion}</p>
                            </div>
                            <div className="text-right">
                              <span className="font-mono font-bold text-sm text-foreground">
                                ${o.costoEstimado || quote?.costoTotal || 0} MXN
                              </span>
                              <div className="text-[11px] text-muted-foreground">
                                {o.requiereAprobacionOwner ? (
                                  <span className="text-amber-500 font-medium">Requiere firma Dueño</span>
                                ) : (
                                  <span className="text-emerald-500 font-medium">Auto-cubierto</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Clock className="size-3.5" /> Estado: <strong className="text-foreground">{o.estado}</strong>
                            </span>

                            {isPendingApproval ? (
                              <Button
                                size="sm"
                                variant="default"
                                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                                onClick={() => handleApproveQuote(quote.id, o.id)}
                              >
                                <CheckCircle2 className="size-3.5 mr-1" />
                                {dict.expensesTab.approveAction}
                              </Button>
                            ) : quote?.estado === "APPROVED" ? (
                              <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
                                ✓ {dict.expensesTab.approved}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                En Revisión
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Formulario rápido para reportar necesidad */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dict.expensesTab.newExpense}</CardTitle>
                <CardDescription className="text-xs">Genera cotización y orden</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddExpense} className="space-y-3 text-xs">
                  <div>
                    <label className="font-medium text-foreground">Título / Falla</label>
                    <Input
                      placeholder="Ej. Cambio de compresor AC"
                      value={newExpenseTitle}
                      onChange={(e) => setNewExpenseTitle(e.target.value)}
                      required
                      className="h-9 mt-1"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-foreground">Costo Estimado (MXN)</label>
                    <Input
                      type="number"
                      placeholder="3500"
                      value={newExpenseCost}
                      onChange={(e) => setNewExpenseCost(e.target.value)}
                      required
                      className="h-9 mt-1"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-foreground">Detalle / Diagnóstico</label>
                    <Input
                      placeholder="Fuga de gas y balero desgastado"
                      value={newExpenseDesc}
                      onChange={(e) => setNewExpenseDesc(e.target.value)}
                      className="h-9 mt-1"
                    />
                  </div>
                  <Button type="submit" disabled={loadingExpense} className="w-full h-9 rounded-xl text-xs font-semibold">
                    {loadingExpense ? "Reportando..." : "+ Enviar para Aprobación"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------------- 2. LLEGADAS & ESTADÍAS ---------------- */}
        <TabsContent value="stays" className="space-y-4 pt-3">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2 border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dict.staysTab.upcomingStays}</CardTitle>
                <CardDescription className="text-xs">{dict.staysTab.subtitle}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {stays.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No hay llegadas programadas próximamente.</p>
                ) : (
                  stays.map((s: any) => (
                    <div key={s.id} className="p-3.5 rounded-xl border border-border bg-card space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <Badge variant="secondary" className="text-[11px] font-semibold text-primary mb-1">
                            {s.tipo === "MOVE_IN" ? dict.staysTab.ownerStay : dict.staysTab.guestVisit}
                          </Badge>
                          <h4 className="font-bold text-sm text-foreground">{s.responsable}</h4>
                          <p className="text-xs text-muted-foreground">{s.notas || "Sin notas adicionales."}</p>
                        </div>
                        <span className="text-xs font-mono font-medium text-foreground bg-muted/60 px-2.5 py-1 rounded-lg">
                          📅 {new Date(s.fecha).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="rounded-lg bg-muted/30 p-2.5 text-xs space-y-1.5">
                        <p className="font-semibold text-foreground text-[11px] uppercase tracking-wider">
                          {dict.staysTab.prepChecklist}:
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                          <span className="flex items-center gap-1.5 text-emerald-500">
                            <CheckCircle2 className="size-3.5" /> {dict.staysTab.cleaningDone}
                          </span>
                          <span className="flex items-center gap-1.5 text-emerald-500">
                            <CheckCircle2 className="size-3.5" /> {dict.staysTab.acChecked}
                          </span>
                          <span className="flex items-center gap-1.5 text-emerald-500">
                            <CheckCircle2 className="size-3.5" /> {dict.staysTab.suppliesReady}
                          </span>
                          <span className="flex items-center gap-1.5 text-emerald-500">
                            <CheckCircle2 className="size-3.5" /> {dict.staysTab.qrEmitted}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dict.staysTab.scheduleStay}</CardTitle>
                <CardDescription className="text-xs">Prepara el inmueble con anticipación</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleScheduleStay} className="space-y-3 text-xs">
                  <div>
                    <label className="font-medium text-foreground">Nombre del Huésped / Dueño</label>
                    <Input
                      placeholder="John Doe (Owner)"
                      value={stayGuestName}
                      onChange={(e) => setStayGuestName(e.target.value)}
                      required
                      className="h-9 mt-1"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-foreground">Fecha de Llegada</label>
                    <Input
                      type="date"
                      value={stayDate}
                      onChange={(e) => setStayDate(e.target.value)}
                      required
                      className="h-9 mt-1"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-foreground">{dict.staysTab.specialRequests}</label>
                    <Input
                      placeholder="Dejar 2 garrafones de agua y AC a 22°C"
                      value={stayNotes}
                      onChange={(e) => setStayNotes(e.target.value)}
                      className="h-9 mt-1"
                    />
                  </div>
                  <Button type="submit" className="w-full h-9 rounded-xl text-xs font-semibold">
                    + Agendar Llegada
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------------- 3. BÓVEDA DIGITAL ---------------- */}
        <TabsContent value="vault" className="space-y-4 pt-3">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2 border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dict.vaultTab.title}</CardTitle>
                <CardDescription className="text-xs">{dict.vaultTab.subtitle}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {vaultKeys.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No hay claves registradas en la bóveda.</p>
                ) : (
                  vaultKeys.map((vk: any) => {
                    const isVisible = showKeys[vk.id];
                    return (
                      <div key={vk.id} className="p-3.5 rounded-xl border border-border bg-card flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <KeyRound className="size-4 text-primary" />
                            <span className="font-bold text-sm text-foreground">{vk.keyName}</span>
                            <Badge variant="outline" className="text-[10px] font-mono uppercase">
                              {vk.type}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{vk.instructions}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="font-mono text-sm font-bold bg-muted/60 px-3 py-1.5 rounded-lg select-all">
                            {isVisible ? vk.keyValue : "••••••••••••"}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setShowKeys({ ...showKeys, [vk.id]: !isVisible })}
                          >
                            {isVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dict.vaultTab.addKey}</CardTitle>
                <CardDescription className="text-xs">Cifrado a nivel de aplicación</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddVaultKey} className="space-y-3 text-xs">
                  <div>
                    <label className="font-medium text-foreground">{dict.vaultTab.keyName}</label>
                    <Input
                      placeholder="Cerradura Puerta Principal"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      required
                      className="h-9 mt-1"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-foreground">{dict.vaultTab.type}</label>
                    <select
                      value={newKeyType}
                      onChange={(e: any) => setNewKeyType(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs mt-1"
                    >
                      <option value="SMART_LOCK">Cerradura Inteligente</option>
                      <option value="WIFI">Red Wi-Fi</option>
                      <option value="ALARM">Alarma Perimetral</option>
                      <option value="LOCKBOX">Caja Fuerte / Llaves</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-medium text-foreground">{dict.vaultTab.value}</label>
                    <Input
                      placeholder="PIN: 9482# / Password"
                      value={newKeyValue}
                      onChange={(e) => setNewKeyValue(e.target.value)}
                      required
                      className="h-9 mt-1"
                    />
                  </div>
                  <Button type="submit" className="w-full h-9 rounded-xl text-xs font-semibold">
                    + Guardar en Bóveda
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------------- 4. CHAT PM-DUEÑO CON TRADUCCIÓN IA ---------------- */}
        <TabsContent value="chat" className="space-y-4 pt-3">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    {dict.chatTab.title}
                  </CardTitle>
                  <CardDescription className="text-xs">{dict.chatTab.subtitle}</CardDescription>
                </div>
                <Badge variant="outline" className="border-primary/40 text-primary text-xs">
                  DeepSeek IA Bilingüe
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-72 overflow-y-auto space-y-3 p-3 rounded-xl bg-muted/20 border border-border/60">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                    Inicia una conversación con el dueño. Tus mensajes se traducirán automáticamente.
                  </div>
                ) : (
                  chatMessages.map((m: any) => {
                    const isShowingOriginal = showOriginal[m.id];
                    const textToDisplay = m.translated && !isShowingOriginal ? m.translated : m.contenido;

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col max-w-[80%] rounded-xl p-3 text-xs space-y-1 ${
                          m.esMio ? "ml-auto bg-primary text-primary-foreground" : "mr-auto bg-card border border-border text-foreground"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[10px] opacity-80">
                          <span className="font-bold">{m.remitente} ({m.rol})</span>
                          <span>{new Date(m.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-sm leading-relaxed">{textToDisplay}</p>
                        {m.translated && (
                          <div className="pt-1 flex items-center justify-between text-[10px] opacity-90 border-t border-white/20">
                            <span className="inline-flex items-center gap-1 font-medium">
                              <Sparkles className="size-3" /> {dict.chatTab.autoTranslated}
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowOriginal({ ...showOriginal, [m.id]: !isShowingOriginal })}
                              className="underline hover:opacity-100 cursor-pointer"
                            >
                              {isShowingOriginal ? "Ver traducción" : dict.chatTab.viewOriginal}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  placeholder={dict.chatTab.placeholder}
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                  className="h-10 text-xs rounded-xl"
                  required
                />
                <Button type="submit" disabled={sendingMsg} className="h-10 px-4 rounded-xl text-xs font-semibold">
                  <Send className="size-4 mr-1.5" />
                  {sendingMsg ? dict.chatTab.translating : dict.chatTab.send}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- 5. ACUERDO & FONDO RESERVA ---------------- */}
        <TabsContent value="agreement" className="space-y-4 pt-3">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-base">{dict.agreementTab.title}</CardTitle>
                <CardDescription className="text-xs">{dict.agreementTab.reserveDesc}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">{dict.agreementTab.managementType}:</span>
                  <Badge variant="outline" className="text-xs font-mono">
                    {property.managementType === "THIRD_PARTY" ? "Cartera de Terceros (Fiduciario)" : "Propiedad Propia"}
                  </Badge>
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">{dict.agreementTab.fundCustodian}:</span>
                  <span className="font-semibold text-foreground">{property.fundCustodian}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">{dict.agreementTab.commission}:</span>
                  <span className="font-bold font-mono text-primary">
                    {(Number(property.acuerdo?.tasaComision || 0.10) * 100).toFixed(0)}% de Renta Recaudada
                  </span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-muted-foreground">{dict.agreementTab.reserveFund}:</span>
                  <span className="font-bold font-mono text-foreground">
                    ${property.acuerdo?.reservaMinima || 2000} MXN
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-base">Contrato de Arrendamiento Activo</CardTitle>
                <CardDescription className="text-xs">Inquilino y vigencia actual</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {property.contratos?.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Inmueble vacante. Sin contrato activo.</p>
                ) : (
                  property.contratos?.map((c: any) => (
                    <div key={c.id} className="space-y-2">
                      <div className="flex justify-between border-b border-border pb-2">
                        <span className="text-muted-foreground">Inquilino:</span>
                        <span className="font-medium text-foreground">{c.inquilino}</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-2">
                        <span className="text-muted-foreground">Monto Renta:</span>
                        <span className="font-mono font-bold text-foreground">
                          ${c.montoRenta} {c.moneda}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-2">
                        <span className="text-muted-foreground">Día de Pago:</span>
                        <span className="font-mono text-foreground">Día {c.diaPago} de cada mes</span>
                      </div>
                      <div className="flex justify-between pt-1">
                        <span className="text-muted-foreground">Vigencia:</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(c.inicio).toLocaleDateString()} al {new Date(c.fin).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
