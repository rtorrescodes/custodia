import assert from "node:assert";

/**
 * PRUEBA DE CONCURRENCIA REAL: CONDICIÓN DE CARRERA ENTRE DOS ÓRDENES (RACE CONDITION)
 * 
 * Escenario:
 * - Saldo libre en custodia: $6,000 MXN.
 * - Llegan SIMULTÁNEAMENTE dos órdenes de trabajo:
 *   * Orden A (Plomería urgente): $4,000 MXN.
 *   * Orden B (Reparación eléctrica): $4,000 MXN.
 * - Suma requerida: $8,000 MXN (Insuficiente: faltan $2,000 MXN).
 * 
 * Regla de Oro Fiduciaria:
 * Solo la primera orden que adquiera el lock transaccional (SELECT FOR UPDATE) o complete su
 * transacción debe pasar a IN_PROGRESS ($4,000 comprometidos).
 * La segunda orden DEBE ser detectada como deficitaria ($6,000 - $4,000 = $2,000 disponibles < $4,000)
 * y colocada en AWAITING_APPROVAL con solicitud de aportación por el déficit ($2,000 MXN).
 * 
 * En ningún caso debe producirse sobregiro en la cuenta fiduciaria ni ambas órdenes quedar IN_PROGRESS ($8,000 comprometidos).
 */

class FiduciaryEscrowAccount {
  private balance: number;
  private locked: boolean = false;
  public commitments: Map<string, number> = new Map();

  constructor(initialBalance: number) {
    this.balance = initialBalance;
  }

  get availableBalance(): number {
    let totalCommitted = 0;
    for (const val of this.commitments.values()) {
      totalCommitted += val;
    }
    return Math.max(0, this.balance - totalCommitted);
  }

  /**
   * Intenta comprometer fondos simulando una transacción de base de datos con aislamiento
   */
  async tryCommitFunds(orderId: string, amount: number): Promise<{ success: boolean; committed: boolean; availableRemaining: number; deficit: number }> {
    // Simular tiempo de carrera de red concurrente
    await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 20) + 5));

    // Bloqueo pesimista de cuenta (simula FOR UPDATE / serializable)
    while (this.locked) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    this.locked = true;

    try {
      const currentAvail = this.availableBalance;
      if (currentAvail >= amount) {
        // Fondos suficientes: se comprometen
        this.commitments.set(orderId, amount);
        return {
          success: true,
          committed: true,
          availableRemaining: this.availableBalance,
          deficit: 0
        };
      } else {
        // Fondos insuficientes: no se compromete, se calcula déficit
        const deficit = amount - currentAvail;
        return {
          success: true,
          committed: false,
          availableRemaining: currentAvail,
          deficit
        };
      }
    } finally {
      this.locked = false;
    }
  }
}

async function runRealConcurrencyTest() {
  console.log("================================================================================");
  console.log("🏛️ CUSTODIA: PRUEBA DE CONCURRENCIA REAL ENTRE DOS ÓRDENES (ANTI-SOBREGIRO)");
  console.log("================================================================================\n");

  const escrow = new FiduciaryEscrowAccount(6000); // $6,000 MXN iniciales
  console.log(`Saldo inicial fiduciario: $${escrow.availableBalance} MXN`);

  console.log("Disparando dos autorizaciones concurrentes de $4,000 MXN simultáneamente...");

  // Disparo simultáneo con Promise.all
  const [resA, resB] = await Promise.all([
    escrow.tryCommitFunds("WO-PLOMERIA-01", 4000),
    escrow.tryCommitFunds("WO-ELECTRICA-02", 4000)
  ]);

  console.log("\nResultados concurrentes obtenidos:");
  console.log("Orden A (Plomería $4,000):", resA);
  console.log("Orden B (Eléctrica $4,000):", resB);

  // Verificaciones formales
  const oneCommitted = (resA.committed && !resB.committed) || (!resA.committed && resB.committed);
  assert.strictEqual(oneCommitted, true, "Exactamente UNA orden debió comprometer fondos y la otra ser rechazada por déficit");

  const acceptedOrder = resA.committed ? "Orden A (Plomería)" : "Orden B (Eléctrica)";
  const rejectedOrder = resA.committed ? "Orden B (Eléctrica)" : "Orden A (Plomería)";
  const rejectedResult = resA.committed ? resB : resA;

  console.log(`\n✅ Ganadora del lock fiduciario: ${acceptedOrder} -> IN_PROGRESS ($4,000 comprometidos)`);
  console.log(`✅ Rechazada por falta de saldo: ${rejectedOrder} -> AWAITING_APPROVAL`);
  console.log(`   Déficit derivado a aportación: $${rejectedResult.deficit} MXN`);
  console.log(`   Saldo restante en cuenta: $${escrow.availableBalance} MXN`);

  assert.strictEqual(rejectedResult.deficit, 2000, "El déficit solicitado al dueño debe ser exactamente $2,000 MXN");
  assert.strictEqual(escrow.availableBalance, 2000, "El disponible final debe ser exactamente $2,000 MXN");

  console.log("\n================================================================================");
  console.log("🎉 VERIFICACIÓN DE CONCURRENCIA EXITOSA: CERO SOBREGIRO NI DOBLE ASIGNACIÓN.");
  console.log("================================================================================\n");
}

runRealConcurrencyTest().catch(console.error);
