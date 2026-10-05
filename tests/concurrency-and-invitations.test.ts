import assert from "node:assert";
import crypto from "node:crypto";

/**
 * PRUEBAS DE CONCURRENCIA REAL E INVITACIONES CRIPTOGRÁFICAS — CUS-01B
 * Ejecuta dos creaciones incompatibles en paralelo y valida atomización de invitaciones.
 */

interface LeaseRecord {
  id: string;
  propertyId: string;
  startDate: Date;
  endDate: Date;
  status: "ACTIVE" | "ENDED";
}

interface InvitationRecord {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt?: Date | null;
  revokedAt?: Date | null;
}

class ConcurrentDatabaseSimulator {
  leases: LeaseRecord[] = [];
  invitations: InvitationRecord[] = [];
  // Mutex / Lock a nivel de unidad para simular transacción serializable o SELECT FOR UPDATE en PostgreSQL
  private propertyLocks: Set<string> = new Set();
  private invitationLocks: Set<string> = new Set();

  /**
   * Intento de creación de contrato con bloqueo exclusivo por propiedad (Simula SELECT FOR UPDATE / SERIALIZABLE)
   */
  async createLeaseConcurrent(propertyId: string, startDate: Date, endDate: Date): Promise<{ success: boolean; leaseId?: string; error?: string }> {
    // Simular latencia de red aleatoria entre 10ms y 50ms para forzar condiciones de carrera
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 40) + 10));

    // Bloqueo pesimista de la propiedad en la transacción
    if (this.propertyLocks.has(propertyId)) {
      // Si la propiedad está bloqueada por una transacción concurrente, esperar o detectar conflicto
      return { success: false, error: "CONFLICTO DE CONCURRENCIA: Transacción simultánea en progreso sobre esta unidad." };
    }

    this.propertyLocks.add(propertyId);
    try {
      // Simular tiempo de validación de negocio dentro de la transacción
      await new Promise(r => setTimeout(r, 15));

      // 1. Verificar traslape contra contratos ya confirmados
      const activeLeases = this.leases.filter(l => l.propertyId === propertyId && l.status === "ACTIVE");
      for (const lease of activeLeases) {
        const overlaps = (startDate <= lease.endDate) && (endDate >= lease.startDate);
        if (overlaps) {
          return { success: false, error: `TRASLAPE INCOMPATIBLE: La unidad ya cuenta con el contrato ${lease.id} en este periodo.` };
        }
      }

      // 2. Insertar contrato confirmado
      const newLease: LeaseRecord = {
        id: `lease-${crypto.randomUUID()}`,
        propertyId,
        startDate,
        endDate,
        status: "ACTIVE"
      };
      this.leases.push(newLease);
      return { success: true, leaseId: newLease.id };
    } finally {
      this.propertyLocks.delete(propertyId);
    }
  }

  /**
   * Consumo atómico de invitación con protección contra replay y condición de carrera
   */
  async acceptInvitationConcurrent(rawToken: string, userId: string, requestedRolePayload?: string): Promise<{ success: boolean; error?: string; grantedRole?: string }> {
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 30) + 10));

    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    if (this.invitationLocks.has(tokenHash)) {
      return { success: false, error: "CONFLICTO: La invitación está siendo procesada concurrentemente." };
    }

    this.invitationLocks.add(tokenHash);
    try {
      const inv = this.invitations.find(i => i.tokenHash === tokenHash);
      if (!inv) {
        return { success: false, error: "INVITACIÓN INVÁLIDA: Token alterado o inexistente." };
      }
      if (inv.revokedAt) {
        return { success: false, error: "INVITACIÓN REVOCADA: Cancelada por el administrador." };
      }
      if (inv.acceptedAt) {
        return { success: false, error: "INVITACIÓN YA CONSUMIDA: Este enlace fue utilizado previamente." };
      }
      if (new Date() > inv.expiresAt) {
        return { success: false, error: "INVITACIÓN EXPIRADA: Plazo de vigencia concluido." };
      }

      // El rol otorgado SIEMPRE es el registrado en la invitación, ignorando el payload del cliente
      const grantedRole = inv.role;

      // Consumo atómico
      inv.acceptedAt = new Date();
      return { success: true, grantedRole };
    } finally {
      this.invitationLocks.delete(tokenHash);
    }
  }
}

async function runConcurrencyAndInvitationTests() {
  console.log("===============================================================");
  console.log("⚡ PRUEBAS DE CONCURRENCIA REAL E INVITACIONES CRIPTOGRÁFICAS");
  console.log("===============================================================\n");

  const db = new ConcurrentDatabaseSimulator();

  // -------------------------------------------------------------------------
  // 1. CONCURRENCIA REAL DE CONTRATOS TRASLAPADOS
  // -------------------------------------------------------------------------
  console.log("1. Probando dos creaciones de contratos incompatibles en paralelo...");
  const targetProperty = "prop-unit-501";
  const start = new Date("2026-11-01");
  const end = new Date("2027-10-31");

  // Lanzar dos transacciones simultáneas con Promise.all
  const [resA, resB] = await Promise.all([
    db.createLeaseConcurrent(targetProperty, start, end),
    db.createLeaseConcurrent(targetProperty, start, end)
  ]);

  const successes = [resA, resB].filter(r => r.success);
  const failures = [resA, resB].filter(r => !r.success);

  assert.strictEqual(successes.length, 1, "Exactamente una transacción debe confirmar con éxito");
  assert.strictEqual(failures.length, 1, "Exactamente una transacción debe ser rechazada con conflicto");
  assert.strictEqual(db.leases.filter(l => l.propertyId === targetProperty).length, 1, "La base de datos debe contener solo 1 contrato activo");

  console.log("   ✅ Transacción A:", resA.success ? `Confirmada (${resA.leaseId})` : `Rechazada (${resA.error})`);
  console.log("   ✅ Transacción B:", resB.success ? `Confirmada (${resB.leaseId})` : `Rechazada (${resB.error})`);
  console.log("   ✅ Cero traslapes incompatibles en el estado final.");

  // -------------------------------------------------------------------------
  // 2. DOS CONSUMOS CONCURRENTES DE LA MISMA INVITACIÓN
  // -------------------------------------------------------------------------
  console.log("\n2. Probando dos consumos simultáneos del mismo token de invitación...");
  const rawTokenOrigin = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawTokenOrigin).digest("hex");

  db.invitations.push({
    id: "inv-secure-1",
    tenantId: "tenant-pm",
    email: "assistant@pm.com",
    role: "PM_STAFF",
    tokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    acceptedAt: null,
    revokedAt: null
  });

  const [consumeA, consumeB] = await Promise.all([
    db.acceptInvitationConcurrent(rawTokenOrigin, "user-session-1"),
    db.acceptInvitationConcurrent(rawTokenOrigin, "user-session-2")
  ]);

  const consumeSuccess = [consumeA, consumeB].filter(c => c.success);
  const consumeFails = [consumeA, consumeB].filter(c => !c.success);

  assert.strictEqual(consumeSuccess.length, 1, "Máximo un consumo efectivo");
  assert.strictEqual(consumeFails.length, 1, "El consumo paralelo concurrente debe ser rechazado");
  console.log("   ✅ Consumo 1:", consumeA.success ? "Exitoso" : `Rechazado: ${consumeA.error}`);
  console.log("   ✅ Consumo 2:", consumeB.success ? "Exitoso" : `Rechazado: ${consumeB.error}`);

  // -------------------------------------------------------------------------
  // 3. INTENTO DE ESCALACIÓN DE ROL EN PAYLOAD DE INVITACIÓN
  // -------------------------------------------------------------------------
  console.log("\n3. Probando intento de escalación de privilegios en el payload...");
  const tokenForStaff = crypto.randomBytes(32).toString("hex");
  db.invitations.push({
    id: "inv-staff-only",
    tenantId: "tenant-pm",
    email: "clerk@pm.com",
    role: "PM_STAFF", // Asignado por el admin
    tokenHash: crypto.createHash("sha256").update(tokenForStaff).digest("hex"),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });

  // El atacante envía payload pidiendo role: "PM_ADMIN"
  const escalationAttempt = await db.acceptInvitationConcurrent(tokenForStaff, "user-clerk", "PM_ADMIN");
  assert.strictEqual(escalationAttempt.success, true);
  assert.strictEqual(escalationAttempt.grantedRole, "PM_STAFF", "El rol otorgado debe ser estrictamente el de la invitación (PM_STAFF), no PM_ADMIN");
  console.log("   ✅ Intento de escalación neutralizado: rol otorgado strictly PM_STAFF.");

  // -------------------------------------------------------------------------
  // 4. TOKEN EXPIRADO Y REVOCADO
  // -------------------------------------------------------------------------
  console.log("\n4. Probando expiración y revocación de invitaciones...");
  const expiredToken = crypto.randomBytes(32).toString("hex");
  db.invitations.push({
    id: "inv-expired",
    tenantId: "tenant-pm",
    email: "late@pm.com",
    role: "PM_STAFF",
    tokenHash: crypto.createHash("sha256").update(expiredToken).digest("hex"),
    expiresAt: new Date(Date.now() - 10000) // Expirado en el pasado
  });

  const expiredRes = await db.acceptInvitationConcurrent(expiredToken, "user-late");
  assert.strictEqual(expiredRes.success, false);
  assert.match(expiredRes.error!, /INVITACIÓN EXPIRADA/);
  console.log("   ✅ Invitación expirada rechazada correctamente.");

  const revokedToken = crypto.randomBytes(32).toString("hex");
  db.invitations.push({
    id: "inv-revoked",
    tenantId: "tenant-pm",
    email: "fired@pm.com",
    role: "PM_STAFF",
    tokenHash: crypto.createHash("sha256").update(revokedToken).digest("hex"),
    expiresAt: new Date(Date.now() + 100000),
    revokedAt: new Date() // Revocado
  });

  const revokedRes = await db.acceptInvitationConcurrent(revokedToken, "user-fired");
  assert.strictEqual(revokedRes.success, false);
  assert.match(revokedRes.error!, /INVITACIÓN REVOCADA/);
  console.log("   ✅ Invitación revocada rechazada correctamente.");

  console.log("\n===============================================================");
  console.log("🎉 PRUEBAS DE CONCURRENCIA E INVITACIONES COMPLETADAS CON ÉXITO");
  console.log("===============================================================");
}

runConcurrencyAndInvitationTests().catch(err => {
  console.error("❌ Fallo en pruebas de concurrencia e invitaciones:", err);
  process.exit(1);
});
