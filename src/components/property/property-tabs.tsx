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
  ArrowRight,
  Package,
  Layers,
} from "lucide-react"
import { getDictionary, Locale } from "@/lib/i18n"
import {
  createExpenseAction,
  approveQuoteAction,
  scheduleStayAction,
  cancelStayAction,
  completeCareInspectionAction,
  sendChatMessageAction,
  requestOwnerContributionAction,
  configurePmExpensePolicyAction,
  recordSupplyMovementAction,
  recordVendorPaymentAction,
  startWorkOrderAction,
  verifyOwnerContributionAction,
  getEvidenceSignedUrlAction,
} from "@/app/actions/property-operations.actions"
import {
  createOperationalTaskAction,
  updateOperationalTaskStatusAction,
  requestTaskVerificationAction,
  resolveTaskVerificationAction,
} from "@/app/actions/operational-task.actions"
import {
  renewLeaseAction,
  processMoveOutWithDepositReviewAction,
  executeRecurringObligationAction,
} from "@/app/actions/lease.actions"
import {
  generateOwnerPerformanceReportAction,
  executePropertyHandoffAction,
} from "@/app/actions/property.actions"
import {
  revealVaultSecretAction,
  addVaultEntry,
} from "@/app/actions/vault.actions"

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
  const [assigningStayId, setAssigningStayId] = useState<string | null>(null);
  const [selectedAssignee, setSelectedAssignee] = useState<Record<string, string>>({});
  const [assigningLoading, setAssigningLoading] = useState<Record<string, boolean>>({});

  // Estado de Chat PM-Dueño
  const [chatMessages, setChatMessages] = useState<any[]>(property.chat?.mensajes || []);
  const [msgInput, setMsgInput] = useState("");
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const [sendingMsg, setSendingMsg] = useState(false);

  // Estado de Suministros & Insumos
  const [supplies, setSupplies] = useState(property.suministros || []);
  const [selectedSupplyId, setSelectedSupplyId] = useState("");
  const [supplyQty, setSupplyQty] = useState("");
  const [supplyType, setSupplyType] = useState<"INFLOW" | "OUTFLOW" | "ADJUSTMENT">("OUTFLOW");
  const [supplyReason, setSupplyReason] = useState("");
  const [loadingSupply, setLoadingSupply] = useState(false);

  // Estado de Aportaciones
  const [contributions, setContributions] = useState(property.aportacionesDueño || []);
  const [verifyingContribId, setVerifyingContribId] = useState<string | null>(null);
  const [confirmedAmounts, setConfirmedAmounts] = useState<Record<string, string>>({});
  const [verifyingLoading, setVerifyingLoading] = useState<Record<string, boolean>>({});

  // Estado de Tareas Operativas
  const [tasks, setTasks] = useState(property.tareasOperativas || []);
  const [taskEvidenceNotes, setTaskEvidenceNotes] = useState<Record<string, string>>({});
  const [taskReviewNotes, setTaskReviewNotes] = useState<Record<string, string>>({});
  const [taskActionLoading, setTaskActionLoading] = useState<Record<string, boolean>>({});

  // Handlers para Aportaciones y Órdenes
  async function handleOpenEvidence(contribId: string) {
    const res = await getEvidenceSignedUrlAction({ contributionId: contribId });
    if (res.success && res.data?.signedUrl) {
      window.open(res.data.signedUrl, "_blank");
    } else {
      alert("No se pudo obtener el comprobante: " + (res.error || "Archivo no disponible"));
    }
  }

  async function handleVerifyContribution(contribId: string) {
    const amtStr = confirmedAmounts[contribId];
    const amt = amtStr ? parseFloat(amtStr) : undefined;
    setVerifyingLoading({ ...verifyingLoading, [contribId]: true });
    try {
      const res = await verifyOwnerContributionAction({
        contributionId: contribId,
        verifiedAmount: amt,
        notes: "Verificado formalmente por PM desde interfaz de administración",
      });
      if (res.success && res.data) {
        setContributions(contributions.map((c: any) => c.id === contribId ? { ...c, estado: "VERIFIED", montoVerificado: res.data?.releasedAmount } : c));
        alert("¡Aportación verificada y fondos liberados exitosamente!");
      } else {
        alert("Error al verificar: " + (res.error || "No se pudo verificar"));
      }
    } finally {
      setVerifyingLoading({ ...verifyingLoading, [contribId]: false });
    }
  }

  async function handleStartWorkOrder(workOrderId: string) {
    const res = await startWorkOrderAction({ workOrderId });
    if (res.success && res.data) {
      setOrders(orders.map((o: any) => o.id === workOrderId ? { ...o, estado: "IN_PROGRESS" } : o));
      alert("¡Orden de trabajo iniciada con fondos fiduciarios asegurados!");
    } else {
      alert("No se pudo iniciar la orden: " + (res.error || "Fondos insuficientes"));
    }
  }

  async function handleRequestTaskVerification(taskId: string) {
    const notes = taskEvidenceNotes[taskId];
    if (!notes || notes.trim().length < 5) {
      alert("Ingresa notas de evidencia de entrega (mínimo 5 caracteres).");
      return;
    }
    setTaskActionLoading({ ...taskActionLoading, [taskId]: true });
    try {
      const res = await requestTaskVerificationAction({
        taskId,
        evidenceNotes: notes.trim(),
        evidenceUrls: [],
      });
      if (res.success) {
        setTasks(tasks.map((t: any) => t.id === taskId ? { ...t, estado: "VERIFICATION_PENDING" } : t));
        alert("Entrega de tarea enviada a verificación del PM.");
      } else {
        alert("Error: " + (res.error || "No se pudo solicitar verificación"));
      }
    } finally {
      setTaskActionLoading({ ...taskActionLoading, [taskId]: false });
    }
  }

  async function handleResolveTaskVerification(taskId: string, approved: boolean) {
    const notes = taskReviewNotes[taskId] || (approved ? "Aprobado por PM" : "Requiere corrección");
    setTaskActionLoading({ ...taskActionLoading, [taskId]: true });
    try {
      const res = await resolveTaskVerificationAction({
        taskId,
        approved,
        notes,
      });
      if (res.success && res.data) {
        const newStatus = res.data.status;
        setTasks(tasks.map((t: any) => t.id === taskId ? { ...t, estado: newStatus } : t));
        // Si estaba ligada a una estadía, actualizar también el estado de estadías
        setStays(stays.map((s: any) => {
          if (s.linkedTasks && s.linkedTasks.some((lt: any) => lt.id === taskId)) {
            const updatedLinked = s.linkedTasks.map((lt: any) => lt.id === taskId ? { ...lt, estado: newStatus } : lt);
            const allCompleted = updatedLinked.every((lt: any) => lt.estado === "COMPLETED");
            return {
              ...s,
              estado: allCompleted ? "COMPLETED" : s.estado,
              linkedTasks: updatedLinked
            };
          }
          return s;
        }));
        alert(approved ? "¡Verificación técnica aprobada! Tarea completada." : "Tarea devuelta al responsable para correcciones.");
      } else {
        alert("Error: " + (res.error || "No se pudo resolver"));
      }
    } finally {
      setTaskActionLoading({ ...taskActionLoading, [taskId]: false });
    }
  }

  async function handleRecordSupplyMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSupplyId || !supplyQty || !supplyReason) return;
    setLoadingSupply(true);
    const qty = parseFloat(supplyQty);
    const res = await recordSupplyMovementAction({
      propertyId: property.id,
      supplyId: selectedSupplyId,
      type: supplyType,
      quantity: qty,
      reason: supplyReason,
    });
    if (res.success && res.data) {
      setSupplies(supplies.map((s: any) => s.id === selectedSupplyId ? { ...s, stockActual: res.data?.newBalance } : s));
      setSupplyQty("");
      setSupplyReason("");
      alert("Movimiento de inventario registrado con éxito.");
    } else {
      alert("Error: " + (res.error || "No se pudo registrar el movimiento"));
    }
    setLoadingSupply(false);
  }
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
      category: "MAINTENANCE",
      priority: "MEDIUM",
    });
    if (res.success) {
      setOrders([
        {
          id: res.data?.workOrderId,
          titulo: newExpenseTitle,
          descripcion: newExpenseDesc,
          estado: res.data?.isBlockedFunds ? "AWAITING_APPROVAL" : "PENDING",
          costoEstimado: cost,
          costoReal: 0,
          requiereAprobacionOwner: res.data?.requiresOwnerApproval,
          cotizaciones: [{
            id: res.data?.quoteId,
            version: 1,
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

  async function handleApproveQuote(quoteId: string, orderId: string, version: number = 1) {
    const res = await approveQuoteAction({
      quoteId,
      expectedVersion: version,
      reason: "Aprobado por el usuario en interfaz",
    });
    if (res.success) {
      setOrders(orders.map((o: any) => {
        if (o.id === orderId) {
          return {
            ...o,
            estado: res.data?.readyToStart ? "IN_PROGRESS" : "AWAITING_APPROVAL",
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
    const res = await addVaultEntry({
      propertyId: property.id,
      keyName: newKeyName,
      type: newKeyType,
      keyValue: newKeyValue,
      instructions: "Configurado desde el centro de mando",
    });
    if (res.success && res.data) {
      setVaultKeys([
        ...vaultKeys,
        {
          id: res.data.id,
          keyName: res.data.keyName,
          type: res.data.type,
          keyValue: "••••••••",
          instructions: res.data.instructions,
        }
      ]);
      setNewKeyName("");
      setNewKeyValue("");
    }
  }

  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [loadingReveal, setLoadingReveal] = useState<Record<string, boolean>>({});

  async function handleToggleReveal(vaultId: string) {
    if (revealedSecrets[vaultId]) {
      // Ocultar si ya estaba revelado
      const copy = { ...revealedSecrets };
      delete copy[vaultId];
      setRevealedSecrets(copy);
      return;
    }

    setLoadingReveal({ ...loadingReveal, [vaultId]: true });
    const res = await revealVaultSecretAction({
      vaultId,
      propertyId: property.id,
    });

    if (res.success && res.data) {
      setRevealedSecrets({
        ...revealedSecrets,
        [vaultId]: res.data.decryptedValue,
      });
    }
    setLoadingReveal({ ...loadingReveal, [vaultId]: false });
  }

  async function handleScheduleStay(e: React.FormEvent) {
    e.preventDefault();
    if (!stayGuestName || !stayDate) return;
    const res = await scheduleStayAction({
      propertyId: property.id,
      guestName: stayGuestName,
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

  async function handleAssignStayPreparationTask(stayId: string, stayDate: string, stayGuest: string) {
    const assigneeId = selectedAssignee[stayId];
    if (!assigneeId) {
      alert("Por favor selecciona un integrante del equipo.");
      return;
    }
    setAssigningLoading({ ...assigningLoading, [stayId]: true });
    const assigneeUser = property.teamMembers?.find((m: any) => m.id === assigneeId);

    const res = await createOperationalTaskAction({
      propertyId: property.id,
      title: `Preparación de llegada: Suministros e insumos para ${stayGuest}`,
      description: `Verificar surtido completo de insumos, sábanas, toallas y condiciones del inmueble previo a la llegada del ${new Date(stayDate).toLocaleDateString()}.`,
      priority: "HIGH",
      dueDate: stayDate,
      sourceType: "STAY",
      sourceId: stayId,
      assigneeId: assigneeId,
      checklist: [
        { id: "1", text: "Inspeccionar y colocar sábanas y toallas limpias", completed: false, required: true },
        { id: "2", text: "Verificar stock de insumos básicos (jabón, papel, café)", completed: false, required: true },
        { id: "3", text: "Validar encendido y funcionamiento de aires acondicionados", completed: false, required: false },
      ]
    });

    if (res.success && res.data) {
      const newTask = {
        id: res.data.taskId,
        titulo: `Preparación de llegada: Suministros e insumos para ${stayGuest}`,
        estado: res.data.status,
        assigneeId: assigneeId,
        assigneeName: assigneeUser ? assigneeUser.email : "Equipo Operativo",
        dueDate: stayDate,
      };

      setStays(stays.map((s: any) => {
        if (s.id === stayId) {
          const currentLinked = s.linkedTasks || [];
          const exists = currentLinked.some((t: any) => t.id === res.data?.taskId);
          return {
            ...s,
            linkedTasks: exists ? currentLinked.map((t: any) => t.id === res.data?.taskId ? newTask : t) : [...currentLinked, newTask]
          };
        }
        return s;
      }));
      setAssigningStayId(null);
    } else {
      alert("Error al asignar tarea: " + (res.error || "No se pudo asignar"));
    }
    setAssigningLoading({ ...assigningLoading, [stayId]: false });
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
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-9 h-auto p-1 bg-muted/60 rounded-xl gap-1">
          <TabsTrigger value="expenses" className="text-xs py-2">
            <DollarSign className="size-3.5 mr-1" />
            {dict.tabs.expenses}
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs py-2">
            <Wrench className="size-3.5 mr-1" />
            {dict.tabs.tasks}
          </TabsTrigger>
          <TabsTrigger value="vendorPayments" className="text-xs py-2">
            <DollarSign className="size-3.5 mr-1 text-emerald-600" />
            {dict.tabs.vendorPayments}
          </TabsTrigger>
          <TabsTrigger value="settlements" className="text-xs py-2">
            <Receipt className="size-3.5 mr-1 text-purple-600" />
            {dict.tabs.settlements}
          </TabsTrigger>
          <TabsTrigger value="stays" className="text-xs py-2">
            <CalendarDays className="size-3.5 mr-1" />
            {dict.tabs.stays}
          </TabsTrigger>
          <TabsTrigger value="supplies" className="text-xs py-2">
            <Package className="size-3.5 mr-1" />
            {dict.tabs.supplies}
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
            <Layers className="size-3.5 mr-1" />
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
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="size-4 text-amber-500 shrink-0" />
                    <span>
                      {property.acuerdo?.estaConfigurado ? (
                        <>
                          Facultad PM: <strong className="text-foreground">${property.acuerdo?.pmExpenseLimit} MXN</strong> (Gastos mayores requieren firma Dueño)
                        </>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400 font-medium">
                          ⚠️ Política de gasto no configurada: Todos los gastos requieren autorización del dueño
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[11px] border-amber-500/40 text-amber-600">
                      Reserva: ${property.acuerdo?.reservaMinima || 2000} MXN
                    </Badge>
                    <Badge variant="secondary" className="text-[11px]">
                      Disponible: ${(property.fondosFiduciarios?.disponibleNuevasObligaciones || 0).toLocaleString()} MXN
                    </Badge>
                  </div>
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
                            ) : quote?.estado === "APPROVED" && (o.estado === "AWAITING_APPROVAL" || o.bloqueadoPorFondos) ? (
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/10 font-medium">
                                  Aprobada, esperando inicio
                                </Badge>
                                <Button
                                  size="sm"
                                  className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg"
                                  onClick={() => handleStartWorkOrder(o.id)}
                                >
                                  Iniciar Orden Fondeada
                                </Button>
                              </div>
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

                {/* Sección de Aportaciones de Propietario (Verificación PM de Recepción) */}
                <div className="pt-4 border-t border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-sm text-foreground">Aportaciones de Propietario</h4>
                      <p className="text-xs text-muted-foreground">Verificación de transferencias reportadas y comprobantes bancarios</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {contributions.filter((c: any) => c.estado === "REPORTED").length} por verificar
                    </Badge>
                  </div>

                  {contributions.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">No hay aportaciones registradas.</p>
                  ) : (
                    contributions.map((c: any) => (
                      <div key={c.id} className="p-3 rounded-xl border border-border/80 bg-muted/20 space-y-2">
                        <div className="flex items-start justify-between gap-2 text-xs">
                          <div>
                            <span className="font-semibold text-foreground">{c.motivo}</span>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              <span>Solicitado: <strong>${c.monto.toLocaleString()} {c.moneda}</strong></span>
                              {c.montoReportado && (
                                <span className="ml-2">· Reportado: <strong className="text-primary">${c.montoReportado.toLocaleString()} {c.moneda}</strong></span>
                              )}
                              {c.referencia && (
                                <span className="ml-2 font-mono">· Ref: {c.referencia}</span>
                              )}
                            </div>
                            {c.notas && (
                              <p className="text-[10px] text-muted-foreground mt-1 bg-background/50 p-1 rounded border border-border/40">
                                {c.notas}
                              </p>
                            )}
                          </div>
                          <div>
                            <Badge
                              variant={c.estado === "VERIFIED" ? "outline" : c.estado === "REPORTED" ? "secondary" : "outline"}
                              className={`text-[10px] ${
                                c.estado === "VERIFIED"
                                  ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/10"
                                  : c.estado === "REPORTED"
                                  ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {c.estado === "VERIFIED" ? "✓ Verificada" : c.estado === "REPORTED" ? "Reportada" : "Solicitada"}
                            </Badge>
                          </div>
                        </div>

                        {c.estado === "REPORTED" && (
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-xs">
                            <div className="flex items-center gap-2">
                              {c.comprobanteUrl && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/5"
                                  onClick={() => handleOpenEvidence(c.id)}
                                >
                                  Ver Comprobante
                                </Button>
                              )}
                              <Input
                                type="number"
                                placeholder={`Importe real (${c.montoReportado || c.monto})`}
                                value={confirmedAmounts[c.id] || ""}
                                onChange={(e) => setConfirmedAmounts({ ...confirmedAmounts, [c.id]: e.target.value })}
                                className="h-7 w-32 text-xs font-mono"
                              />
                            </div>
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                              disabled={verifyingLoading[c.id]}
                              onClick={() => handleVerifyContribution(c.id)}
                            >
                              {verifyingLoading[c.id] ? "Verificando..." : "Confirmar Recepción"}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
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
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-semibold ${
                              s.estado === "COMPLETED"
                                ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/10"
                                : "text-amber-600 border-amber-500/30 bg-amber-500/10"
                            }`}
                          >
                            {s.estado === "COMPLETED" ? "✓ Lista para llegada" : "⏳ Preparación Bloqueada"}
                          </Badge>
                          <span className="text-xs font-mono font-medium text-foreground bg-muted/60 px-2.5 py-1 rounded-lg">
                            📅 {new Date(s.fecha).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-lg bg-muted/30 p-3 text-xs space-y-2 border border-border/50">
                        <p className="font-semibold text-foreground text-[11px] uppercase tracking-wider flex items-center justify-between">
                          <span>{dict.staysTab.prepChecklist}</span>
                          <span className="text-[10px] text-muted-foreground font-normal lowercase">operación en sitio</span>
                        </p>

                        <div className="space-y-2 text-xs divide-y divide-border/40">
                          {/* Requisito 1: Suministros e Insumos */}
                          <div className="pt-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <span className="font-medium text-foreground flex items-center gap-1.5">
                                <Package className="size-3.5 text-primary" />
                                {dict.staysTab.suppliesReady}
                              </span>
                              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                                <span>{dict.staysTab.assigneeLabel}</span>
                                {s.linkedTasks && s.linkedTasks.length > 0 ? (
                                  <span className="font-semibold text-foreground bg-primary/10 text-primary px-2 py-0.5 rounded">
                                    {s.linkedTasks[0].assigneeName || "Equipo asignado"}
                                  </span>
                                ) : (
                                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                                    {dict.staysTab.unassigned}
                                  </span>
                                )}
                                <span>· {dict.staysTab.dueLabel} {new Date(s.fecha).toLocaleDateString()}</span>
                              </div>
                            </div>

                            <div className="shrink-0 flex items-center gap-2">
                              {s.linkedTasks && s.linkedTasks.length > 0 ? (
                                <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-500/5 text-[11px]">
                                  ✓ {s.linkedTasks[0].estado}
                                </Badge>
                              ) : assigningStayId === s.id ? (
                                <div className="flex items-center gap-1.5">
                                  <select
                                    className="h-8 text-xs rounded-lg border border-border bg-background px-2"
                                    value={selectedAssignee[s.id] || ""}
                                    onChange={(e) => setSelectedAssignee({ ...selectedAssignee, [s.id]: e.target.value })}
                                  >
                                    <option value="">Seleccionar personal...</option>
                                    {(property.teamMembers || []).map((m: any) => (
                                      <option key={m.id} value={m.id}>
                                        {m.email} ({m.role})
                                      </option>
                                    ))}
                                  </select>
                                  <Button
                                    size="sm"
                                    className="h-8 text-xs rounded-lg"
                                    disabled={assigningLoading[s.id]}
                                    onClick={() => handleAssignStayPreparationTask(s.id, s.fecha, s.responsable)}
                                  >
                                    {assigningLoading[s.id] ? "Asignando..." : "Confirmar"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-xs"
                                    onClick={() => setAssigningStayId(null)}
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px] rounded-lg border-primary/30 text-primary hover:bg-primary/5"
                                  onClick={() => setAssigningStayId(s.id)}
                                >
                                  {dict.staysTab.assignTaskBtn}
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Requisitos complementarios */}
                          <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-muted-foreground text-[11px]">
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="size-3" /> {dict.staysTab.cleaningDone}
                            </span>
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="size-3" /> {dict.staysTab.acChecked}
                            </span>
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="size-3" /> {dict.staysTab.qrEmitted}
                            </span>
                          </div>
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

        {/* ---------------- 2.5. SUMINISTROS & INSUMOS (CUS-09B) ---------------- */}
        <TabsContent value="supplies" className="space-y-4 pt-3">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2 border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="size-4 text-primary" />
                  Inventario de Insumos y Suministros
                </CardTitle>
                <CardDescription className="text-xs">
                  Control de consumos por reparaciones, estancias de dueños y reposiciones
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {supplies.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No hay insumos registrados en esta propiedad.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {supplies.map((s: any) => (
                      <div key={s.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground text-sm">{s.item}</span>
                            <Badge variant="outline" className="text-[10px]">{s.categoria}</Badge>
                          </div>
                          <p className="text-muted-foreground text-[11px] mt-0.5">
                            Mínimo requerido: {s.stockMinimo} {s.unidad}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`font-mono font-bold text-sm ${s.stockActual <= s.stockMinimo ? "text-amber-500" : "text-foreground"}`}>
                            {s.stockActual} {s.unidad}
                          </span>
                          {s.stockActual <= s.stockMinimo && (
                            <p className="text-[10px] text-amber-500 font-medium">Bajo stock</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Registrar Movimiento</CardTitle>
                <CardDescription className="text-xs">Entrada, consumo o ajuste auditable</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRecordSupplyMovement} className="space-y-3 text-xs">
                  <div>
                    <label className="font-medium text-foreground">Insumo</label>
                    <select
                      value={selectedSupplyId}
                      onChange={(e) => setSelectedSupplyId(e.target.value)}
                      required
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs mt-1"
                    >
                      <option value="">Selecciona insumo...</option>
                      {supplies.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.item} ({s.stockActual} {s.unidad})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-medium text-foreground">Tipo de Movimiento</label>
                    <select
                      value={supplyType}
                      onChange={(e: any) => setSupplyType(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs mt-1"
                    >
                      <option value="OUTFLOW">Consumo / Salida (Mantenimiento/Estadía)</option>
                      <option value="INFLOW">Reabastecimiento / Entrada</option>
                      <option value="ADJUSTMENT">Ajuste de Conteo Físico</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-medium text-foreground">Cantidad</label>
                    <Input
                      type="number"
                      step="any"
                      placeholder="1"
                      value={supplyQty}
                      onChange={(e) => setSupplyQty(e.target.value)}
                      required
                      className="h-9 mt-1"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-foreground">Motivo Justificado</label>
                    <Input
                      placeholder="Ej. Uso en reparación de fuga de baño"
                      value={supplyReason}
                      onChange={(e) => setSupplyReason(e.target.value)}
                      required
                      className="h-9 mt-1"
                    />
                  </div>
                  <Button type="submit" disabled={loadingSupply} className="w-full h-9 rounded-xl text-xs font-semibold">
                    {loadingSupply ? "Registrando..." : "+ Guardar Movimiento"}
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
                    const isRevealed = !!revealedSecrets[vk.id];
                    const isLoading = !!loadingReveal[vk.id];
                    return (
                      <div key={vk.id} className="p-3.5 rounded-xl border border-border bg-card flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <KeyRound className="size-4 text-primary" />
                            <span className="font-bold text-sm text-foreground">{vk.keyName}</span>
                            <Badge variant="outline" className="text-[10px] font-mono uppercase">
                              {vk.type}
                            </Badge>
                            {vk.isRotated && (
                              <Badge variant="secondary" className="text-[9px] bg-emerald-500/10 text-emerald-600">
                                Rotada
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{vk.instructions}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="font-mono text-sm font-bold bg-muted/60 px-3 py-1.5 rounded-lg select-all">
                            {isRevealed ? revealedSecrets[vk.id] : "••••••••••••"}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            disabled={isLoading}
                            onClick={() => handleToggleReveal(vk.id)}
                            title={isRevealed ? "Ocultar secreto" : "Revelar secreto (Registra auditoría)"}
                          >
                            {isRevealed ? <EyeOff className="size-4 text-primary" /> : <Eye className="size-4" />}
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
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setShowOriginal({ ...showOriginal, [m.id]: !isShowingOriginal })}
                                className="underline hover:opacity-100 cursor-pointer"
                              >
                                {isShowingOriginal ? "Ver traducción" : dict.chatTab.viewOriginal}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                const title = prompt("Título para la tarea operativa:", m.contenido.slice(0, 40));
                                if (!title) return;
                                const { convertChatMessageToTaskAction } = await import("@/app/actions/operational-task.actions");
                                const res = await convertChatMessageToTaskAction({
                                  propertyId: property.id,
                                  messageId: m.id,
                                  messageContent: m.contenido,
                                  title,
                                  priority: "MEDIUM",
                                });
                                if (res.success) {
                                  alert(res.data?.alreadyExisted ? "Esta tarea ya había sido generada." : "¡Tarea operativa creada exitosamente!");
                                }
                              }}
                              className="bg-background/20 hover:bg-background/40 px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-all"
                              title="Convertir este mensaje en una tarea con confirmación humana"
                            >
                              + Crear Tarea
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

        {/* ---------------- 6. TAREAS OPERATIVAS & VERIFICACIÓN ---------------- */}
        <TabsContent value="tasks" className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-primary" />
                  Control de Tareas y Verificación
                </CardTitle>
                <CardDescription className="text-xs">
                  Flujo de ejecución: asignación, avance justificado y revisión técnica PM
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p className="text-xs text-muted-foreground">
                  Permite al personal solicitar verificación con evidencia fotográfica y al PM resolver la aprobación técnica para habilitar liquidación.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                    Flujo: Asignada → En Proceso → Verificación Solicitada → Aprobada
                  </Badge>
                </div>

                <div className="space-y-3 pt-2">
                  {tasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">No hay tareas asignadas.</p>
                  ) : (
                    tasks.map((t: any) => (
                      <div key={t.id} className="p-3 rounded-xl border border-border bg-card space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h5 className="font-semibold text-xs text-foreground">{t.titulo}</h5>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  t.estado === "COMPLETED"
                                    ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/5"
                                    : t.estado === "VERIFICATION_PENDING"
                                    ? "text-amber-600 border-amber-500/30 bg-amber-500/5"
                                    : "text-blue-600 border-blue-500/30 bg-blue-500/5"
                                }`}
                              >
                                {t.estado}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{t.descripcion}</p>
                            <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2">
                              <span>Asignado: <strong>{t.assigneeName || "Sin asignar"}</strong></span>
                              {t.fechaLimite && <span>· Límite: {new Date(t.fechaLimite).toLocaleDateString()}</span>}
                            </div>
                          </div>
                        </div>

                        {/* Controles para operario: Reportar entrega con evidencia */}
                        {t.estado !== "COMPLETED" && t.estado !== "VERIFICATION_PENDING" && (
                          <div className="pt-2 border-t border-border/40 space-y-2">
                            <label className="text-[11px] font-medium text-foreground block">
                              Reportar entrega (Operario):
                            </label>
                            <div className="flex gap-2">
                              <Input
                                placeholder="Notas de evidencia y confirmación de entrega..."
                                value={taskEvidenceNotes[t.id] || ""}
                                onChange={(e) => setTaskEvidenceNotes({ ...taskEvidenceNotes, [t.id]: e.target.value })}
                                className="h-8 text-xs"
                              />
                              <Button
                                size="sm"
                                className="h-8 text-xs shrink-0 rounded-lg"
                                disabled={taskActionLoading[t.id]}
                                onClick={() => handleRequestTaskVerification(t.id)}
                              >
                                {taskActionLoading[t.id] ? "Enviando..." : "Solicitar Verificación"}
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Controles para PM: Resolver Verificación */}
                        {t.estado === "VERIFICATION_PENDING" && (
                          <div className="pt-2 border-t border-border/40 space-y-2 bg-amber-500/5 p-2 rounded-lg">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-amber-600">Revisión de Entrega (PM):</span>
                            </div>
                            <Input
                              placeholder="Notas de dictamen técnico..."
                              value={taskReviewNotes[t.id] || ""}
                              onChange={(e) => setTaskReviewNotes({ ...taskReviewNotes, [t.id]: e.target.value })}
                              className="h-8 text-xs bg-background"
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/5 rounded-lg"
                                disabled={taskActionLoading[t.id]}
                                onClick={() => handleResolveTaskVerification(t.id, false)}
                              >
                                Devolver Corrección
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                                disabled={taskActionLoading[t.id]}
                                onClick={() => handleResolveTaskVerification(t.id, true)}
                              >
                                Aprobar Verificación
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-blue-600" />
                  Arrendamiento: Renovación y Salida
                </CardTitle>
                <CardDescription className="text-xs">
                  Versionado inmutable de contratos y liquidación fiduciaria de depósito en garantía
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p className="text-xs text-muted-foreground">
                  Al renovar se genera una nueva versión preservando el histórico. Al procesar salida (check-out), la liquidación del depósito requiere dictamen humano obligatorio.
                </p>
                <Badge variant="secondary" className="text-xs">
                  Supervisión Requerida: Liquidación de Depósito
                </Badge>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------------- 7. PAGOS A PROVEEDORES & COMPROMISOS ---------------- */}
        <TabsContent value="vendorPayments" className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  Liquidación a Proveedores y Órdenes
                </CardTitle>
                <CardDescription className="text-xs">
                  Pagos parciales y finiquitos vinculados a órdenes de trabajo verificadas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p className="text-xs text-muted-foreground">
                  Consume saldo disponible bajo custodia y amortiza el compromiso financiero de la orden sin duplicar asientos contables ni comprometer depósitos en garantía.
                </p>
                <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Custodia financiera:</span>
                    <span className="font-semibold text-foreground">Separación estricta de fondos y depósitos</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Condición indispensable:</span>
                    <span className="font-semibold text-emerald-600">Verificación PM aprobada previamente</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-600" />
                  Política de Fondos y Retención
                </CardTitle>
                <CardDescription className="text-xs">
                  Alineación fiduciaria con el fondo de reserva
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-muted-foreground">
                <p>
                  Si la orden supera los fondos libres bajo custodia, se requiere que el propietario apruebe una aportación complementaria antes de liberar el pago final al proveedor.
                </p>
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
                  Control Estricto: Cero Desvío de Fondos
                </Badge>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------------- 8. LIQUIDACIONES AL PROPIETARIO ---------------- */}
        <TabsContent value="settlements" className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-purple-600" />
                  Liquidaciones Periódicas al Dueño
                </CardTitle>
                <CardDescription className="text-xs">
                  Distribución neta de ingresos por rentas y transferencias de saldos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p className="text-xs text-muted-foreground">
                  El propietario puede consultar su informe en español o inglés y revisar la liquidación neta tras retención de comisión y constitución de la reserva contractual.
                </p>
                <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Frecuencia habitual:</span>
                    <span className="font-semibold text-foreground">Mensual (primeros 5 días hábiles)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Deducción de reserva:</span>
                    <span className="font-semibold text-foreground">Automática hasta cumplir meta acordada</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-primary" />
                  Gobernanza y Entrega de Cartera
                </CardTitle>
                <CardDescription className="text-xs">
                  Emisión de informes y desvinculación formal de PM
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p className="text-xs text-muted-foreground">
                  Al completar el período de administración o acordar un cambio de PM, se genera el acta de entrega formal con el corte de caja, bitácora de activos e inventario de insumos.
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 p-2 rounded border border-border">
                  <ShieldAlert className="size-4 shrink-0 text-primary" />
                  <span>Control Perimetral: Emisión de credenciales y pases enlazados al control de acceso residencial.</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
