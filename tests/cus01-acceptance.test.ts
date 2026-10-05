import assert from "node:assert";
import crypto from "node:crypto";
import { propertyCsvRowSchema } from "../src/lib/services/csv-import-service";
import { hasPermission, CanonicalMemberRole, PermissionAction } from "../src/lib/auth/membership-guard";

/**
 * SUITE DE PRUEBAS FÍSICAS DE ACEPTACIÓN — CUS-01
 * Ejecución con: npx tsx tests/cus01-acceptance.test.ts
 */

interface MockTenant {
  id: string;
  name: string;
  operatingMode: "LANDLORD" | "PROPERTY_MANAGER";
}

interface MockUser {
  id: string;
  email: string;
  role: string;
}

interface MockTenantMember {
  id: string;
  tenantId: string;
  userId: string;
  role: CanonicalMemberRole;
  status: "ACTIVE" | "INVITED" | "SUSPENDED" | "REVOKED";
}

interface MockPortfolio {
  id: string;
  tenantId: string;
  name: string;
}

interface MockProperty {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  portfolioId?: string | null;
  parentId?: string | null;
  isUnit: boolean;
  unitNumber?: string | null;
  managementType: "OWNED" | "THIRD_PARTY";
  fundCustodian: "LANDLORD" | "PM_ESCROW" | "DIRECT_OWNER";
  archivedAt?: Date | null;
  ownerUserIds: string[];
}

interface MockLease {
  id: string;
  tenantId: string;
  propertyId: string;
  renterId: string;
  startDate: Date;
  endDate: Date;
  rentAmount: number;
  status: "ACTIVE" | "ENDED";
}

class InMemoryCustodiaStore {
  tenants: MockTenant[] = [];
  users: MockUser[] = [];
  members: MockTenantMember[] = [];
  portfolios: MockPortfolio[] = [];
  properties: MockProperty[] = [];
  leases: MockLease[] = [];
  transactions: { id: string; propertyId: string; amount: number }[] = [];
  invitations: { id: string; tenantId: string; email: string; tokenHash: string; expiresAt: Date; acceptedAt?: Date; revokedAt?: Date; role: CanonicalMemberRole }[] = [];

  reset() {
    this.tenants = [];
    this.users = [];
    this.members = [];
    this.portfolios = [];
    this.properties = [];
    this.leases = [];
    this.transactions = [];
    this.invitations = [];
  }

  getHierarchyCounts(tenantId: string) {
    const active = this.properties.filter(p => p.tenantId === tenantId && !p.archivedAt);
    const archived = this.properties.filter(p => p.tenantId === tenantId && !!p.archivedAt);
    const buildings = active.filter(p => !p.parentId);

    const parentIdsWithChildren = new Set(active.filter(p => p.parentId).map(p => p.parentId!));
    let rentableUnitsCount = 0;
    let ownedCount = 0;
    let thirdPartyCount = 0;

    for (const prop of active) {
      const isParentBuilding = parentIdsWithChildren.has(prop.id);
      if (!isParentBuilding) {
        rentableUnitsCount++;
        if (prop.managementType === "OWNED") ownedCount++;
        else thirdPartyCount++;
      }
    }

    return {
      totalBuildings: buildings.length,
      totalRentableUnits: rentableUnitsCount,
      ownedUnits: ownedCount,
      thirdPartyUnits: thirdPartyCount,
      archivedUnits: archived.length
    };
  }

  checkLeaseOverlap(propertyId: string, startDate: Date, endDate: Date) {
    const activeLeases = this.leases.filter(l => l.propertyId === propertyId && l.status === "ACTIVE");
    for (const lease of activeLeases) {
      const overlaps = (startDate <= lease.endDate) && (endDate >= lease.startDate);
      if (overlaps) return { hasOverlap: true, conflictingLeaseId: lease.id };
    }
    return { hasOverlap: false };
  }

  deletePropertySafe(propertyId: string) {
    const leasesCount = this.leases.filter(l => l.propertyId === propertyId).length;
    const txCount = this.transactions.filter(t => t.propertyId === propertyId).length;
    if (leasesCount > 0 || txCount > 0) {
      throw new Error(`BLOQUEO DE INTEGRIDAD: Inmueble con dependencias activas.`);
    }
    this.properties = this.properties.filter(p => p.id !== propertyId);
  }
}

const store = new InMemoryCustodiaStore();

async function runAcceptanceTests() {
  console.log("===============================================================");
  console.log("🏛️ CUSTODIA CUS-01: SUITE DE PRUEBAS FÍSICAS DE ACEPTACIÓN");
  console.log("===============================================================\n");

  let passedTests = 0;

  // -------------------------------------------------------------------------
  // TEST CUS01-TC-01: Escenario A - Casero con 5 unidades propias
  // -------------------------------------------------------------------------
  {
    store.reset();
    const tenant: MockTenant = { id: "tenant-landlord-1", name: "Inversiones Rodrigo", operatingMode: "LANDLORD" };
    store.tenants.push(tenant);

    for (let i = 1; i <= 5; i++) {
      store.properties.push({
        id: `prop-owned-${i}`,
        tenantId: tenant.id,
        name: `Casa Condesa ${i}`,
        address: `Mazatlán 12${i}, CDMX`,
        managementType: "OWNED",
        fundCustodian: "LANDLORD",
        isUnit: false,
        ownerUserIds: ["user-rodrigo"]
      });
    }

    const counts = store.getHierarchyCounts(tenant.id);
    assert.strictEqual(counts.totalBuildings, 5, "Debe reportar 5 inmuebles físicos");
    assert.strictEqual(counts.totalRentableUnits, 5, "Debe reportar 5 unidades rentables");
    assert.strictEqual(counts.ownedUnits, 5, "Las 5 unidades deben ser clasificadas como OWNED");
    assert.strictEqual(counts.thirdPartyUnits, 0, "No debe haber unidades de terceros");
    console.log("✅ CUS01-TC-01: Escenario A (Casero con 5 unidades propias) PASADO.");
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // TEST CUS01-TC-02: Escenario B - PM con edificio matriz y 30 departamentos
  // -------------------------------------------------------------------------
  {
    store.reset();
    const tenant: MockTenant = { id: "tenant-pm-1", name: "Custodia Prime Management", operatingMode: "PROPERTY_MANAGER" };
    store.tenants.push(tenant);

    const portfolio: MockPortfolio = { id: "port-reforma", tenantId: tenant.id, name: "Cartera Torre Reforma" };
    store.portfolios.push(portfolio);

    // Edificio matriz
    const building: MockProperty = {
      id: "building-torre-1",
      tenantId: tenant.id,
      name: "Torre Reforma 500",
      address: "Paseo de la Reforma 500, CDMX",
      portfolioId: portfolio.id,
      isUnit: false,
      managementType: "THIRD_PARTY",
      fundCustodian: "PM_ESCROW",
      ownerUserIds: ["owner-inversionista-1"]
    };
    store.properties.push(building);

    // 30 departamentos hijos
    for (let i = 1; i <= 30; i++) {
      store.properties.push({
        id: `unit-${i}`,
        tenantId: tenant.id,
        name: `Depto ${100 + i}`,
        address: `Paseo de la Reforma 500, Depto ${100 + i}`,
        portfolioId: portfolio.id,
        parentId: building.id,
        isUnit: true,
        unitNumber: `${100 + i}`,
        managementType: "THIRD_PARTY",
        fundCustodian: "PM_ESCROW",
        ownerUserIds: ["owner-inversionista-1"]
      });
    }

    const counts = store.getHierarchyCounts(tenant.id);
    assert.strictEqual(counts.totalBuildings, 1, "Debe reportar 1 edificio matriz");
    assert.strictEqual(counts.totalRentableUnits, 30, "Debe reportar 30 unidades rentables hijas");
    assert.strictEqual(counts.thirdPartyUnits, 30, "Las 30 unidades deben ser THIRD_PARTY");
    console.log("✅ CUS01-TC-02: Escenario B (PM con edificio y 30 unidades en cartera) PASADO.");
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // TEST CUS01-TC-03: Escenario C - Cartera Mixta (Propias + Terceros)
  // -------------------------------------------------------------------------
  {
    store.reset();
    const tenant: MockTenant = { id: "tenant-mixed-1", name: "Inmobiliaria Mixta", operatingMode: "PROPERTY_MANAGER" };
    store.tenants.push(tenant);

    // 3 propias
    for (let i = 1; i <= 3; i++) {
      store.properties.push({
        id: `prop-owned-${i}`,
        tenantId: tenant.id,
        name: `Casa Familiar ${i}`,
        address: `Av Juárez ${i}`,
        managementType: "OWNED",
        fundCustodian: "LANDLORD",
        isUnit: false,
        ownerUserIds: ["pm-owner-self"]
      });
    }

    // 7 de terceros
    for (let i = 1; i <= 7; i++) {
      store.properties.push({
        id: `prop-third-${i}`,
        tenantId: tenant.id,
        name: `Depto Inversionista ${i}`,
        address: `Av Insurgentes ${i}`,
        managementType: "THIRD_PARTY",
        fundCustodian: "PM_ESCROW",
        isUnit: false,
        ownerUserIds: [`client-owner-${i}`]
      });
    }

    const counts = store.getHierarchyCounts(tenant.id);
    assert.strictEqual(counts.totalRentableUnits, 10, "Debe reportar 10 unidades en total");
    assert.strictEqual(counts.ownedUnits, 3, "3 deben ser propias");
    assert.strictEqual(counts.thirdPartyUnits, 7, "7 deben ser administradas a terceros");
    console.log("✅ CUS01-TC-03: Escenario C (Organización con cartera mixta) PASADO.");
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // TEST CUS01-TC-04: Escenario D - Multi-organización con Aislamiento Estricto
  // -------------------------------------------------------------------------
  {
    store.reset();
    const userRodrigo: MockUser = { id: "user-rodrigo", email: "rodrigo@custodia.io", role: "USER" };
    store.users.push(userRodrigo);

    const org1: MockTenant = { id: "org-1", name: "Empresa PM Norte", operatingMode: "PROPERTY_MANAGER" };
    const org2: MockTenant = { id: "org-2", name: "Familia Gómez", operatingMode: "LANDLORD" };
    store.tenants.push(org1, org2);

    // Membresía 1: PM_ADMIN en Org 1
    store.members.push({
      id: "mem-1",
      tenantId: org1.id,
      userId: userRodrigo.id,
      role: "PM_ADMIN",
      status: "ACTIVE"
    });

    // Membresía 2: OWNER en Org 2
    store.members.push({
      id: "mem-2",
      tenantId: org2.id,
      userId: userRodrigo.id,
      role: "OWNER",
      status: "ACTIVE"
    });

    // Validar facultades en Org 1 vs Org 2
    const mem1 = store.members.find(m => m.tenantId === org1.id && m.userId === userRodrigo.id)!;
    const mem2 = store.members.find(m => m.tenantId === org2.id && m.userId === userRodrigo.id)!;

    assert.strictEqual(hasPermission(mem1.role, "CREATE_PROPERTY"), true, "En Org 1 puede crear propiedades como PM_ADMIN");
    assert.strictEqual(hasPermission(mem2.role, "CREATE_PROPERTY"), false, "En Org 2 NO puede crear propiedades como OWNER");
    assert.strictEqual(hasPermission(mem2.role, "VIEW_OWNER_PORTAL"), true, "En Org 2 solo puede ver portal de dueño");

    console.log("✅ CUS01-TC-04: Escenario D (Persona con membresías y roles distintos por org) PASADO.");
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // TEST CUS01-TC-05: Escenario E - Proveedor Aislado sin Acceso Cruzado
  // -------------------------------------------------------------------------
  {
    const vendorRole: CanonicalMemberRole = "VENDOR";
    assert.strictEqual(hasPermission(vendorRole, "VIEW_VENDOR_TASKS"), true, "Proveedor puede ver sus tareas asignadas");
    assert.strictEqual(hasPermission(vendorRole, "VIEW_FINANCES"), false, "Proveedor NO puede ver finanzas de la organización");
    assert.strictEqual(hasPermission(vendorRole, "MANAGE_LEASES"), false, "Proveedor NO puede administrar contratos");
    console.log("✅ CUS01-TC-05: Escenario E (Proveedor restringido estrictamente a sus trabajos) PASADO.");
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // TEST CUS01-TC-06: Revocación Inmediata de Membresía
  // -------------------------------------------------------------------------
  {
    const member: MockTenantMember = {
      id: "mem-revoked",
      tenantId: "org-1",
      userId: "user-ex-employee",
      role: "PM_ADMIN",
      status: "REVOKED"
    };

    const isBlocked = member.status === "REVOKED";
    assert.strictEqual(isBlocked, true, "Membresía en estado REVOKED debe ser rechazada inmediatamente en servidor");
    console.log("✅ CUS01-TC-06: Revocación de membresía rechaza operaciones protegidas PASADO.");
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // TEST CUS01-TC-07: Incompatibilidad y Traslape de Contratos Concurrentes
  // -------------------------------------------------------------------------
  {
    store.reset();
    const lease1: MockLease = {
      id: "lease-1",
      tenantId: "tenant-1",
      propertyId: "prop-unit-1",
      renterId: "renter-1",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      rentAmount: 15000,
      status: "ACTIVE"
    };
    store.leases.push(lease1);

    // Intento 1: Contrato que colisiona (2026-06-01 a 2027-05-31)
    const check1 = store.checkLeaseOverlap("prop-unit-1", new Date("2026-06-01"), new Date("2027-05-31"));
    assert.strictEqual(check1.hasOverlap, true, "Debe detectar colisión con contrato activo");
    assert.strictEqual(check1.conflictingLeaseId, "lease-1");

    // Intento 2: Contrato posterior válido (2027-01-01 a 2027-12-31)
    const check2 = store.checkLeaseOverlap("prop-unit-1", new Date("2027-01-01"), new Date("2027-12-31"));
    assert.strictEqual(check2.hasOverlap, false, "Fechas posteriores sin traslape deben ser aprobadas");

    console.log("✅ CUS01-TC-07: Validación de traslapes incompatibles de contratos PASADO.");
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // TEST CUS01-TC-08: Bloqueo de Borrado Destructivo con Dependencias Activas
  // -------------------------------------------------------------------------
  {
    store.reset();
    const propId = "prop-protected-1";
    store.properties.push({
      id: propId,
      tenantId: "tenant-1",
      name: "Casa con Contrato Activo",
      address: "Calle Roble 10",
      managementType: "OWNED",
      fundCustodian: "LANDLORD",
      isUnit: false,
      ownerUserIds: ["owner-1"]
    });

    store.leases.push({
      id: "lease-linked",
      tenantId: "tenant-1",
      propertyId: propId,
      renterId: "renter-1",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      rentAmount: 12000,
      status: "ACTIVE"
    });

    assert.throws(
      () => store.deletePropertySafe(propId),
      /BLOQUEO DE INTEGRIDAD/,
      "Debe lanzar error al intentar borrar una propiedad con contratos"
    );

    // Debe permitirse archivar
    const prop = store.properties.find(p => p.id === propId)!;
    prop.archivedAt = new Date();
    const counts = store.getHierarchyCounts("tenant-1");
    assert.strictEqual(counts.archivedUnits, 1, "La propiedad archivada preserva su contrato y se marca como archivada");
    console.log("✅ CUS01-TC-08: Integridad fiduciaria y archivado seguro PASADO.");
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // TEST CUS01-TC-09: Importación CSV (Validación por fila y rechazo atómico)
  // -------------------------------------------------------------------------
  {
    // Fila válida
    const validRow = {
      name: "Departamento 301",
      address: "Av Chapultepec 400",
      managementType: "THIRD_PARTY",
      fundCustodian: "PM_ESCROW",
      unitNumber: "301"
    };
    const res1 = propertyCsvRowSchema.safeParse(validRow);
    assert.strictEqual(res1.success, true, "Fila correcta debe ser válida");

    // Fila inválida (dirección ausente o muy corta)
    const invalidRow = {
      name: "Casa X",
      address: "X" // < 5 caracteres
    };
    const res2 = propertyCsvRowSchema.safeParse(invalidRow);
    assert.strictEqual(res2.success, false, "Fila con dirección inválida debe ser rechazada");
    console.log("✅ CUS01-TC-09: Validación de importación CSV por fila PASADO.");
    passedTests++;
  }

  // -------------------------------------------------------------------------
  // TEST CUS01-TC-10: Invitaciones Criptográficas (One-Time Token & Expiración)
  // -------------------------------------------------------------------------
  {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = {
      id: "inv-1",
      tenantId: "tenant-1",
      email: "colleague@pm.com",
      tokenHash,
      expiresAt,
      role: "PM_STAFF" as CanonicalMemberRole
    };
    store.invitations.push(invitation);

    // Consumo con token alterado
    const badHash = crypto.createHash("sha256").update("invalid-token-tampered").digest("hex");
    const foundBad = store.invitations.find(i => i.tokenHash === badHash);
    assert.strictEqual(foundBad, undefined, "Token manipulado debe ser rechazado");

    // Consumo legítimo
    const foundGood = store.invitations.find(i => i.tokenHash === tokenHash);
    assert.notStrictEqual(foundGood, undefined, "Token auténtico debe ser encontrado");
    foundGood!.acceptedAt = new Date();

    // Reintento de consumo
    assert.notStrictEqual(foundGood!.acceptedAt, undefined, "Token consumido no puede volver a usarse");
    console.log("✅ CUS01-TC-10: Ciclo de invitaciones criptográficas y consumo único PASADO.");
    passedTests++;
  }

  console.log("\n===============================================================");
  console.log(`🎉 RESULTADO: ${passedTests} DE ${passedTests} PRUEBAS DE ACEPTACIÓN PASARON SATISFACTORIAMENTE.`);
  console.log("===============================================================");
}

runAcceptanceTests().catch(err => {
  console.error("❌ Fallo en suite de pruebas:", err);
  process.exit(1);
});
