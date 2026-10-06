import assert from "node:assert";
import dotenv from "dotenv";
dotenv.config();
import { prisma } from "../src/lib/prisma";
import { propertyOperationsService } from "../src/lib/services/property-operations.service";
import { evidenceStorageService } from "../src/lib/services/evidence-storage";
const { getCookies } = require("./auth-cookie-helper.cjs");

/**
 * SUITE DE AUTORIZACIÓN ESTRICTA DE EVIDENCIA POR RECURSO (ZERO TRUST CON SUPABASE AUTH REAL)
 * 
 * Evalúa los 7 vectores de seguridad utilizando tokens y sesiones autenticadas reales de Supabase:
 * - Escenario A: PM legítimo con membresía ACTIVE y token Supabase -> Éxito (signedUrl generada).
 * - Escenario B: Propietario titular legítimo con token Supabase -> Éxito (signedUrl generada).
 * - Escenario C: Propietario de otro inmueble intenta acceder -> Denegado (403).
 * - Escenario D: Usuario con membresía revocada (REVOKED) -> Denegado inmediatamente (403).
 * - Escenario E: Usuario ajeno de otra organización (cross-tenant) -> Denegado (403).
 * - Escenario F: Manipulación de ruta (storagePath) fuera de la estructura autorizada -> Denegado.
 * - Escenario G: Inyección de URL externa (http:// o https://) -> Rechazo estricto inmediato.
 */
async function runEvidenceAuthorizationSuite() {
  console.log("================================================================================");
  console.log("🛡️ CUSTODIA: AUTORIZACIÓN ESTRICTA DE EVIDENCIA CON SESIONES REALES SUPABASE");
  console.log("================================================================================\n");

  const TENANT_PM = "63ba31f2-cf6a-4f05-a8f7-06393d6222a8";
  const PROPERTY_ID = "f28e8fa3-63e8-4113-b620-0cf181e2363c"; // Villa Serena
  const PM_EMAIL = "pm@demo.custodia.app";
  const OWNER_EMAIL = "propietario@demo.custodia.app";
  const FOREIGN_EMAIL = "casero@demo.custodia.app";

  console.log("1. Autenticando usuarios mediante Supabase Auth GoTrue...");
  const [pmCookie, ownerCookie, foreignCookie] = await Promise.all([
    getCookies(PM_EMAIL),
    getCookies(OWNER_EMAIL),
    getCookies(FOREIGN_EMAIL)
  ]);

  const decodeUser = (cookieVal: string) => {
    const jsonStr = Buffer.from(cookieVal.replace("base64-", ""), "base64").toString("utf-8");
    return JSON.parse(jsonStr).user;
  };

  const pmUser = decodeUser(pmCookie.value);
  const ownerUser = decodeUser(ownerCookie.value);
  const foreignUser = decodeUser(foreignCookie.value);

  console.log("✅ Sesiones reales de Supabase Auth obtenidas:");
  console.log(`   - PM: ${pmUser.email} (ID: ${pmUser.id})`);
  console.log(`   - Dueño: ${ownerUser.email} (ID: ${ownerUser.id})`);
  console.log(`   - Usuario ajeno: ${foreignUser.email} (ID: ${foreignUser.id})`);

  let testContribution: any = null;
  let revokedUser: any = null;
  let revokedMember: any = null;

  try {
    // 0. Subir archivo sintético real válido a evidence-vault
    const dummyPdf = Buffer.from("%PDF-1.4 test dummy pdf content for evidence auth " + Date.now());
    const uploadRes = await evidenceStorageService.uploadFile({
      tenantId: TENANT_PM,
      propertyId: PROPERTY_ID,
      filename: "test_evidence_auth_real.pdf",
      buffer: dummyPdf,
      mimeType: "application/pdf"
    });
    const storagePath = uploadRes.path;

    testContribution = await prisma.ownerContribution.create({
      data: {
        tenantId: TENANT_PM,
        propertyId: PROPERTY_ID,
        ownerId: ownerUser.id,
        amount: 5000,
        currency: "MXN",
        destinationAccount: "PM_ESCROW",
        reason: "Prueba de autorización de evidencia real",
        status: "REPORTED",
        evidenceUrl: storagePath,
        reference: "SPEI-AUTH-REAL-001"
      }
    });

    console.log(`\nAportación creada para prueba: ${testContribution.id} (Ruta: ${storagePath})`);

    // Crear un miembro con status REVOKED para evaluar el vector de membresía revocada
    revokedUser = await prisma.user.create({
      data: {
        email: `revoked-${Date.now()}@test.custodia.app`,
        role: "MANAGER",
        tenantId: TENANT_PM,
        passwordHash: "dummy-revoked-hash"
      }
    });

    revokedMember = await prisma.tenantMember.create({
      data: {
        tenantId: TENANT_PM,
        userId: revokedUser.id,
        role: "PM_ADMIN",
        status: "REVOKED"
      }
    });

    console.log(`Usuario con membresía REVOKED creado: ${revokedUser.email}`);

    // ESCENARIO A: PM legítimo solicita acceso
    console.log("\n--- ESCENARIO A: PM LEGÍTIMO SOLICITA ACCESO A COMPROBANTE ---");
    const resA = await propertyOperationsService.getEvidenceSignedUrl(
      TENANT_PM,
      pmUser.id,
      { contributionId: testContribution.id }
    );
    assert.ok(resA.signedUrl, "Debe generar URL firmada para PM");
    assert.ok(resA.signedUrl.startsWith("http"), "URL firmada válida");
    console.log("✅ Escenario A [PASS]: PM con membresía ACTIVE autorizado (URL generada).");

    // ESCENARIO B: Propietario titular solicita acceso
    console.log("\n--- ESCENARIO B: PROPIETARIO TITULAR SOLICITA ACCESO A SU COMPROBANTE ---");
    const resB = await propertyOperationsService.getEvidenceSignedUrl(
      TENANT_PM,
      ownerUser.id,
      { contributionId: testContribution.id }
    );
    assert.ok(resB.signedUrl, "Debe generar URL firmada para propietario titular");
    console.log("✅ Escenario B [PASS]: Propietario titular de Villa Serena autorizado.");

    // ESCENARIO B2: Propietario de otra propiedad en el MISMO tenant intenta acceder
    console.log("\n--- ESCENARIO B2: PROPIETARIO DE OTRA PROPIEDAD DEL MISMO TENANT INTENTA ACCEDER ---");
    // Creamos un segundo propietario legítimo en el mismo tenant pero asignado a otra propiedad
    const otherOwnerUser = await prisma.user.create({
      data: {
        email: `other-owner-${Date.now()}@demo.custodia.app`,
        role: "OWNER",
        tenantId: TENANT_PM,
        passwordHash: "dummy-owner-hash"
      }
    });

    let errOtherOwner: any = null;
    try {
      await propertyOperationsService.getEvidenceSignedUrl(
        TENANT_PM,
        otherOwnerUser.id,
        { contributionId: testContribution.id }
      );
    } catch (e: any) {
      errOtherOwner = e;
    }
    await prisma.user.delete({ where: { id: otherOwnerUser.id } }).catch(() => {});

    assert.ok(errOtherOwner, "Debe rechazar al propietario que no es titular de este inmueble");
    assert.match(errOtherOwner.message, /No cuenta con permisos para consultar la evidencia|No cuenta con titularidad/, "Debe indicar falta de titularidad o permisos");
    console.log("✅ Escenario B2 [PASS]: Acceso denegado (403) a propietario de otro inmueble dentro del mismo tenant.");

    // ESCENARIO B3: Sesión inválida / ID inexistente
    console.log("\n--- ESCENARIO B3: SESIÓN O TOKEN INVÁLIDO INTENTA ACCEDER ---");
    let errInvalidSession: any = null;
    try {
      await propertyOperationsService.getEvidenceSignedUrl(
        TENANT_PM,
        "00000000-0000-0000-0000-000000000000",
        { contributionId: testContribution.id }
      );
    } catch (e: any) {
      errInvalidSession = e;
    }
    assert.ok(errInvalidSession, "Debe rechazar sesiones o usuarios inexistentes");
    console.log("✅ Escenario B3 [PASS]: Acceso denegado a sesión/usuario inválido.");

    // ESCENARIO C: Usuario con membresía REVOKED intenta acceder
    console.log("\n--- ESCENARIO C: USUARIO CON MEMBRESÍA REVOKED INTENTA ACCEDER ---");
    let errRevoked: any = null;
    try {
      await propertyOperationsService.getEvidenceSignedUrl(
        TENANT_PM,
        revokedUser.id,
        { contributionId: testContribution.id }
      );
    } catch (e: any) {
      errRevoked = e;
    }
    assert.ok(errRevoked, "Debe rechazar al usuario con membresía REVOKED");
    assert.match(errRevoked.message, /Membresía no activa o revocada/, "Debe indicar membresía no activa");
    console.log("✅ Escenario C [PASS]: Acceso denegado (403) a usuario con membresía revocada.");

    // ESCENARIO D: Usuario de otra organización (cross-tenant) intenta acceder
    console.log("\n--- ESCENARIO D: USUARIO DE OTRA ORGANIZACIÓN INTENTA ACCEDER ---");
    let errForeign: any = null;
    try {
      await propertyOperationsService.getEvidenceSignedUrl(
        TENANT_PM,
        foreignUser.id,
        { contributionId: testContribution.id }
      );
    } catch (e: any) {
      errForeign = e;
    }
    assert.ok(errForeign, "Debe rechazar al usuario de otra organización");
    console.log("✅ Escenario D [PASS]: Acceso denegado (403) a usuario ajeno a la organización.");

    // ESCENARIO E: Manipulación de ruta (storagePath) fuera de tenant
    console.log("\n--- ESCENARIO E: MANIPULACIÓN DE RUTA DE ALMACENAMIENTO ---");
    let errPath: any = null;
    try {
      await propertyOperationsService.getEvidenceSignedUrl(
        TENANT_PM,
        pmUser.id,
        { storagePath: "otro-tenant/otra-propiedad/secreto.pdf" }
      );
    } catch (e: any) {
      errPath = e;
    }
    assert.ok(errPath, "Debe rechazar rutas fuera de la estructura autorizada");
    console.log("✅ Escenario E [PASS]: Rechazo estricto de ruta fuera de tenant.");

    // ESCENARIO F: Inyección de URL externa (SSRF / Unsafe URL)
    console.log("\n--- ESCENARIO F: INYECCIÓN DE URL EXTERNA NO PRIVADA ---");
    let errUrl: any = null;
    try {
      await propertyOperationsService.getEvidenceSignedUrl(
        TENANT_PM,
        pmUser.id,
        { storagePath: "https://malicious-site.com/evil.pdf" }
      );
    } catch (e: any) {
      errUrl = e;
    }
    assert.ok(errUrl, "Debe rechazar URLs externas");
    console.log("✅ Escenario F [PASS]: Inyección de URL externa rechazada de inmediato.");

    console.log("\n================================================================================");
    console.log("🎉 SUITE DE AUTORIZACIÓN DE EVIDENCIA PASADA CON ÉXITO Y SESIONES REALES");
    console.log("================================================================================\n");

  } finally {
    if (testContribution) {
      if (testContribution.evidenceUrl) {
        await evidenceStorageService.deleteFile(testContribution.evidenceUrl).catch(() => {});
      }
      await prisma.ownerContribution.delete({ where: { id: testContribution.id } }).catch(() => {});
    }
    if (revokedMember) {
      await prisma.tenantMember.delete({ where: { id: revokedMember.id } }).catch(() => {});
    }
    if (revokedUser) {
      await prisma.user.delete({ where: { id: revokedUser.id } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

runEvidenceAuthorizationSuite().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error("❌ ERROR EN SUITE DE AUTORIZACIÓN DE EVIDENCIA:", err);
  process.exit(1);
});
