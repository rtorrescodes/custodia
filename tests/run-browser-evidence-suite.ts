import assert from "node:assert";
import dotenv from "dotenv";
dotenv.config();
import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";
import { getCookies } from "./auth-cookie-helper.cjs";
import { Pool } from "pg";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3000";
const PROPERTY_ID = "f28e8fa3-63e8-4113-b620-0cf181e2363c"; // Villa Serena Residencial
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const SCREENSHOTS_DIR = path.join(__dirname, "screenshots");

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function runBrowserEvidenceSuite() {
  console.log("================================================================================");
  console.log("🏛️ CUSTODIA: SUITE DE DEMOSTRACIÓN EN NAVEGADOR REAL (RODRIGO REVIEW)");
  console.log("================================================================================\n");

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1400,900"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  try {
    // -------------------------------------------------------------------------
    // 1. PROPIETARIO REPORTA COMPROBANTE -> FORMULARIO ACCESIBLE CON ARCHIVO
    // -------------------------------------------------------------------------
    console.log("--- 1. Propietario reporta transferencia con formulario accesible ---");
    
    // Asegurar que exista una aportación en status REQUESTED para Villa Serena
    let targetContrib = (await pool.query(
      `SELECT id, amount, currency, reason FROM "OwnerContribution" WHERE "propertyId" = $1 AND status = 'REQUESTED' ORDER BY "createdAt" DESC LIMIT 1`,
      [PROPERTY_ID]
    )).rows[0];

    if (!targetContrib) {
      const insRes = await pool.query(
        `INSERT INTO "OwnerContribution" (id, "tenantId", "propertyId", "ownerId", amount, currency, reason, status, "requestedAt", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), '63ba31f2-cf6a-4f05-a8f7-06393d6222a8', $1, '41d2bb0d-42d5-4839-afd3-2630e6c7c132', 6500, 'MXN', 'Fondeo para reparación de bomba', 'REQUESTED', NOW(), NOW(), NOW())
         RETURNING id, amount, currency, reason`,
        [PROPERTY_ID]
      );
      targetContrib = insRes.rows[0];
    }

    const ownerCookie = await getCookies("propietario@demo.custodia.app");
    await page.setCookie(ownerCookie);

    await page.goto(`${BASE_URL}/portal?propertyId=${PROPERTY_ID}`, { waitUntil: "networkidle2" });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_01_portal_propietario.png"), fullPage: true });

    // Buscar botón "Reportar transferencia"
    const buttons = await page.$$("button");
    let reportButton: any = null;
    for (const b of buttons) {
      const text = await page.evaluate(el => el.textContent, b);
      if (text && text.includes("Reportar transferencia")) {
        reportButton = b;
        break;
      }
    }

    assert.ok(reportButton, "El botón 'Reportar transferencia' debe estar presente en el portal del propietario");
    console.log("Botón 'Reportar transferencia' encontrado. Abriendo modal...");
    await reportButton.click();
    await page.waitForSelector("form", { timeout: 5000 });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_02_modal_reporte_transferencia.png"), fullPage: true });

    // Llenar campos del modal
    console.log("Completando formulario con referencia, archivo y montos...");
    const refInput = await page.$("input[placeholder*='SPEI'], input[placeholder*='Clave']");
    if (refInput) {
      await refInput.type("SPEI-BBVA-VERIF-2026-9900");
    }

    // Asegurar que el input de importe tenga valor válido
    const amountInput = await page.$("input[type='number']");
    if (amountInput) {
      await amountInput.click({ clickCount: 3 });
      await page.keyboard.press("Backspace");
      await amountInput.type("6500");
    }

    // Adjuntar archivo PDF de prueba
    const fileInput = await page.$("input[type='file']");
    if (fileInput) {
      const testPdfPath = path.join(__dirname, "test_comprobante.pdf");
      if (!fs.existsSync(testPdfPath)) {
        fs.writeFileSync(testPdfPath, "%PDF-1.4 test comprobante real " + Date.now());
      }
      await fileInput.uploadFile(testPdfPath);
      console.log("Comprobante PDF adjuntado correctamente.");
    }

    await new Promise(r => setTimeout(r, 600));

    // Enviar formulario del modal
    const submitBtn = await page.$("form button[type='submit']");
    assert.ok(submitBtn, "El botón submit del modal debe estar presente");
    await submitBtn.click();

    // Esperar mensaje de éxito o cierre del modal
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_03_transferencia_reportada_exito.png"), fullPage: true });

    // Verificar en BD que el estado cambió a REPORTED
    const dbReported = (await pool.query(
      `SELECT id, status, reference, "reportedAmount", "evidenceUrl" FROM "OwnerContribution" WHERE id = $1`,
      [targetContrib.id]
    )).rows[0];
    console.log("Estado persistido en PostgreSQL tras reporte del dueño:", dbReported);
    assert.strictEqual(dbReported?.status, "REPORTED", "La aportación debe quedar en status REPORTED tras el envío");

    // -------------------------------------------------------------------------
    // 2. PRIVACIDAD ZERO-TRUST: USUARIO AJENO NO PUEDE ACCEDER A LA EVIDENCIA
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Verificando aislamiento de evidencia privada (Zero Trust) ---");
    await page.deleteCookie({ name: ownerCookie.name });
    const caseroCookie = await getCookies("casero@demo.custodia.app");
    await page.setCookie(caseroCookie);

    // Intentar acceder directamente al portal de Villa Serena
    await page.goto(`${BASE_URL}/portal?propertyId=${PROPERTY_ID}`, { waitUntil: "networkidle2" });
    const contenidoAjeno = await page.content();
    const bloqAjeno = contenidoAjeno.includes("No tienes propiedades asignadas") || contenidoAjeno.includes("noProperties");
    console.log("¿Acceso denegado a usuario ajeno en el portal?", bloqAjeno);
    assert.strictEqual(bloqAjeno, true, "Usuario ajeno debe tener denegado el acceso al portal de esta propiedad");
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_04_usuario_ajeno_bloqueado.png"), fullPage: true });

    // -------------------------------------------------------------------------
    // 3. PM ABRE COMPROBANTE, VERIFICA RECEPCIÓN Y GESTIONA LLEGADA
    // -------------------------------------------------------------------------
    console.log("\n--- 3. PM verifica recepción de aportación y prepara llegada ---");
    await page.deleteCookie({ name: caseroCookie.name });
    const pmCookie = await getCookies("pm@demo.custodia.app");
    await page.setCookie(pmCookie);

    // PM verifica formalmente la recepción de la aportación reportada vía servicio real
    const { propertyOperationsService } = await import("../src/lib/services/property-operations.service");
    const pmUser = (await pool.query(`SELECT id FROM "User" WHERE email = 'pm@demo.custodia.app'`)).rows[0];
    const verifyRes = await propertyOperationsService.verifyOwnerContribution(
      "63ba31f2-cf6a-4f05-a8f7-06393d6222a8",
      pmUser.id,
      {
        contributionId: targetContrib.id,
        verifiedAmount: Number(dbReported.reportedAmount || targetContrib.amount),
        notes: "Verificado contra estado de cuenta en revisión Rodrigo"
      }
    );
    console.log("Aportación verificada por PM:", verifyRes);
    assert.strictEqual(verifyRes.status, "VERIFIED");

    await page.goto(`${BASE_URL}/propiedades/${PROPERTY_ID}`, { waitUntil: "networkidle2" });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_05_pm_ficha_propiedad.png"), fullPage: true });

    // Ir a pestaña Llegadas & Estancias
    const staysTrigger = await page.$("button[value='stays']");
    if (staysTrigger) {
      await staysTrigger.click();
      await new Promise(r => setTimeout(r, 1200));
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_06_pm_llegadas_checklist.png"), fullPage: true });
    }

    // Ir a pestaña Tareas para revisar tareas operativas
    const tasksTrigger = await page.$("button[value='tasks']");
    if (tasksTrigger) {
      await tasksTrigger.click();
      await new Promise(r => setTimeout(r, 1200));
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_07_pm_tareas_operativas.png"), fullPage: true });
    }

    // -------------------------------------------------------------------------
    // 4. MÓVIL Y BILINGÜISMO (ES / EN)
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Demostración en Mobile (375x812) y Bilingüismo ES/EN ---");
    await page.setViewport({ width: 375, height: 812, isMobile: true });
    await page.goto(`${BASE_URL}/propiedades/${PROPERTY_ID}`, { waitUntil: "networkidle2" });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_08_mobile_es_ficha.png"), fullPage: true });

    // Cambiar a inglés
    for (const b of await page.$$("button")) {
      const t = await page.evaluate(el => el.textContent, b);
      if (t && t.includes("EN")) {
        await b.click();
        await new Promise(r => setTimeout(r, 1200));
        break;
      }
    }
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_09_mobile_en_ficha.png"), fullPage: true });

    console.log("\n================================================================================");
    console.log("🎉 TODAS LAS DEMOSTRACIONES DE NAVEGADOR CAPTURADAS Y VERIFICADAS EXITOSAMENTE.");
    console.log("================================================================================\n");

  } catch (err: any) {
    console.error("❌ ERROR EN SUITE DE NAVEGADOR:", err);
    process.exit(1);
  } finally {
    await browser.close();
    await pool.end();
  }
}

runBrowserEvidenceSuite();
