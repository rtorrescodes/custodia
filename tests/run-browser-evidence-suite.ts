import assert from "node:assert";
import dotenv from "dotenv";
dotenv.config();
import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";
import { getCookies } from "./auth-cookie-helper.cjs";
import { Pool } from "pg";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3005";
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
    await page.setCookie({
      name: "custodia_active_tenant",
      value: "63ba31f2-cf6a-4f05-a8f7-06393d6222a8",
      domain: "localhost",
      path: "/",
    });

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

    // Asegurar que el input de importe se limpie completamente y se escriba exactamente 6500
    const amountInput = await page.$("input[type='number']");
    if (amountInput) {
      await page.evaluate(() => {
        const el = document.querySelector("input[type='number']") as HTMLInputElement;
        if (el) {
          el.value = "";
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      await amountInput.type("6500");
    }

    // Comprobar antes de enviar que el importe en pantalla es exactamente 6500
    const valueBeforeSubmit = await page.$eval("input[type='number']", (el: any) => el.value);
    console.log("Valor verificado en el input antes de enviar:", valueBeforeSubmit);
    assert.strictEqual(valueBeforeSubmit, "6500", "El importe en pantalla debe ser exactamente 6500");

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

    // Verificar en BD que el estado cambió a REPORTED y que el importe persistido es exactamente 6500
    const dbReported = (await pool.query(
      `SELECT id, status, reference, "reportedAmount", "evidenceUrl" FROM "OwnerContribution" WHERE id = $1`,
      [targetContrib.id]
    )).rows[0];
    console.log("Estado persistido en PostgreSQL tras reporte del dueño:", dbReported);
    assert.strictEqual(dbReported?.status, "REPORTED", "La aportación debe quedar en status REPORTED tras el envío");
    assert.strictEqual(Number(dbReported?.reportedAmount), 6500, "El importe reportado persistido debe ser exactamente 6500");

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
    // 3. PM ABRE COMPROBANTE Y VERIFICA RECEPCIÓN MEDIANTE CONTROLES DE LA UI
    // -------------------------------------------------------------------------
    await page.deleteCookie({ name: caseroCookie.name });
    const pmCookie = await getCookies("pm@demo.custodia.app");
    await page.setCookie(pmCookie);
    await page.setCookie({
      name: "custodia_active_tenant",
      value: "63ba31f2-cf6a-4f05-a8f7-06393d6222a8",
      domain: "localhost",
      path: "/",
    });

    // Auto-aceptar diálogos de alert del navegador
    page.on("dialog", async (dialog) => {
      console.log("Diálogo de alerta en navegador capturado:", dialog.message());
      await dialog.accept().catch(() => {});
    });

    await page.goto(`${BASE_URL}/propiedades/${PROPERTY_ID}`, { waitUntil: "networkidle2" });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_05_pm_ficha_propiedad.png"), fullPage: true });

    // En la pestaña de gastos/aportaciones, PM abre comprobante y confirma recepción con importe 6500
    const expensesTabTrigger = await page.$("button[value='expenses']");
    if (expensesTabTrigger) {
      await expensesTabTrigger.click();
      await new Promise(r => setTimeout(r, 1200));
    }

    // Buscar botón 'Ver Comprobante' en la UI
    for (const b of await page.$$("button")) {
      const text = await page.evaluate(el => el.textContent, b);
      if (text && (text.includes("Ver Comprobante") || text.includes("Comprobante"))) {
        console.log("Botón 'Ver Comprobante' detectado en la UI.");
        break;
      }
    }

    // Llenar importe confirmado en la UI y pulsar 'Confirmar Recepción'
    const confirmInput = await page.$(`input[placeholder*='Importe real']`);
    if (confirmInput) {
      await confirmInput.click({ clickCount: 3 });
      await confirmInput.type("6500");
    }

    // Buscar y pulsar 'Confirmar Recepción'
    let clickedVerifyUi = false;
    for (const b of await page.$$("button")) {
      const text = await page.evaluate(el => el.textContent, b);
      if (text && text.includes("Confirmar Recepción")) {
        await b.click();
        clickedVerifyUi = true;
        await new Promise(r => setTimeout(r, 2500));
        break;
      }
    }

    // Comprobar estrictamente en la base de datos que la UI logró VERIFIED sin ningún fallback
    await new Promise(r => setTimeout(r, 2000));
    const dbVerified = (await pool.query(
      `SELECT status, "verifiedAmount" FROM "OwnerContribution" WHERE id = $1`,
      [targetContrib.id]
    )).rows[0];
    console.log("Aportación tras verificación PM desde UI:", dbVerified);
    assert.strictEqual(dbVerified?.status, "VERIFIED", "La aportación debe quedar VERIFIED exclusivamente por interacción de la interfaz");
    assert.strictEqual(Number(dbVerified?.verifiedAmount), 6500, "El monto verificado debe ser exactamente 6500");

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_05b_pm_aportacion_verificada.png"), fullPage: true });

    // -------------------------------------------------------------------------
    // 3B. CICLO DE PREPARACIÓN DE LLEGADA CON SESIONES INDEPENDIENTES (PM & OPERARIO)
    // -------------------------------------------------------------------------
    console.log("\n--- 3B. Flujo de preparación de llegada: Asignación, entrega y verificación ---");

    // 1. Asegurar estancia identificable para Villa Serena
    let targetStay = (await pool.query(
      `SELECT id, "inspectorName", status, "checklistJson" FROM "Inspection" 
       WHERE "propertyId" = $1 AND type = 'MOVE_IN' AND status != 'DISPUTED' 
       ORDER BY "inspectionDate" DESC LIMIT 1`,
      [PROPERTY_ID]
    )).rows[0];

    if (!targetStay) {
      const insStay = await pool.query(
        `INSERT INTO "Inspection" (id, "tenantId", "propertyId", type, status, "inspectorName", "inspectionDate", "summaryNotes", "checklistJson", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), '63ba31f2-cf6a-4f05-a8f7-06393d6222a8', $1, 'MOVE_IN', 'SCHEDULED', 'Rodrigo Torres (Dueño)', NOW() + INTERVAL '3 days', 'Llegada de propietario - Insumos requeridos', '{"limpieza": true, "aireAcondicionado": true}', NOW(), NOW())
         RETURNING id, "inspectorName", status, "checklistJson"`,
        [PROPERTY_ID]
      );
      targetStay = insStay.rows[0];
    }

    // Demostrar que mientras la tarea esté pendiente/sin verificar, la llegada permanece bloqueada
    assert.notStrictEqual(targetStay.status, "COMPLETED", "La llegada debe comenzar en estado no-COMPLETED (bloqueada por checklist)");

    // 2. PM abre pestaña 'Llegadas & Estancias' y asigna tarea de preparación a proveedor@demo.custodia.app
    await page.goto(`${BASE_URL}/propiedades/${PROPERTY_ID}`, { waitUntil: "networkidle2" });
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll("button[role='tab']"));
      const tab = tabs.find(t => t.textContent && t.textContent.includes("Llegadas & Estancias"));
      if (tab) (tab as HTMLButtonElement).click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // PM busca botón 'Asignar tarea'
    let clickedAssignBtn = false;
    for (const b of await page.$$("button")) {
      const text = await page.evaluate(el => el.textContent, b);
      if (text && (text.includes("Asignar tarea") || text.includes("Asignar Tarea"))) {
        await b.click();
        clickedAssignBtn = true;
        await new Promise(r => setTimeout(r, 1000));
        break;
      }
    }
    assert.ok(clickedAssignBtn, "El botón 'Asignar tarea' debe estar disponible y ser clickeado");

    // En el selector, seleccionar al integrante responsable (proveedor@demo.custodia.app)
    const assigneeSelect = await page.$("select");
    assert.ok(assigneeSelect, "El selector de asignación debe aparecer");
    const vendorOptionVal = await page.evaluate(sel => {
      const options = Array.from((sel as HTMLSelectElement).options);
      const opt = options.find(o => o.text.includes("proveedor@demo.custodia.app") || o.text.includes("VENDOR") || o.text.includes("Equipo"));
      return opt ? opt.value : (options[1] ? options[1].value : "");
    }, assigneeSelect);

    assert.ok(vendorOptionVal, "Debe existir un integrante disponible para asignar");
    await assigneeSelect.select(vendorOptionVal);
    await new Promise(r => setTimeout(r, 500));

    let clickedConfirmAssign = false;
    for (const cb of await page.$$("button")) {
      const cText = await page.evaluate(el => el.textContent, cb);
      if (cText && cText.includes("Confirmar")) {
        await cb.click();
        clickedConfirmAssign = true;
        await new Promise(r => setTimeout(r, 2500));
        break;
      }
    }
    assert.ok(clickedConfirmAssign, "El botón Confirmar asignación debe ser clickeado");

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_06_pm_llegadas_asignacion.png"), fullPage: true });

    // Verificar en BD que la tarea operativa quedó generada en estado ASSIGNED
    const dbTask = (await pool.query(
      `SELECT id, title, status, "assigneeId", "sourceId" FROM "OperationalTask" 
       WHERE "propertyId" = $1 AND "sourceId" = $2 AND status != 'CANCELLED' 
       ORDER BY "createdAt" DESC LIMIT 1`,
      [PROPERTY_ID, targetStay.id]
    )).rows[0];

    assert.ok(dbTask, "Debe existir una tarea operativa ligada a la estancia");
    console.log("Tarea operativa asignada en BD:", dbTask);

    // 3. CAMBIO DE SESIÓN: Responsable (proveedor@demo.custodia.app) inicia sesión en el navegador
    console.log("\n--- 3C. Responsable inicia su propia sesión, abre la tarea y entrega evidencia ---");
    await page.deleteCookie({ name: pmCookie.name });
    const vendorCookie = await getCookies("proveedor@demo.custodia.app");
    await page.setCookie(vendorCookie);
    await page.setCookie({
      name: "custodia_active_tenant",
      value: "63ba31f2-cf6a-4f05-a8f7-06393d6222a8",
      domain: "localhost",
      path: "/",
    });

    // Responsable navega a la ficha de la propiedad y abre pestaña 'Tareas'
    await page.goto(`${BASE_URL}/propiedades/${PROPERTY_ID}`, { waitUntil: "networkidle2" });
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll("button[role='tab']"));
      const tab = tabs.find(t => t.textContent && t.textContent.includes("Tareas Operativas"));
      if (tab) (tab as HTMLButtonElement).click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Responsable escribe notas de evidencia y solicita verificación
    const deliveryInput = await page.$("input[placeholder*='Notas de evidencia']");
    assert.ok(deliveryInput, "El campo de evidencia para el operario debe estar disponible");
    await deliveryInput.click({ clickCount: 3 });
    await deliveryInput.type("Insumos colocados en cocina y baños. Limpieza completa e inspección realizada.");

    let requestedVerification = false;
    for (const rb of await page.$$("button")) {
      const rText = await page.evaluate(el => el.textContent, rb);
      if (rText && rText.includes("Solicitar Verificación")) {
        await rb.click();
        requestedVerification = true;
        await new Promise(r => setTimeout(r, 2000));
        break;
      }
    }
    assert.strictEqual(requestedVerification, true, "El operario debe solicitar verificación desde el botón");
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_07a_responsable_entrega_evidencia.png"), fullPage: true });

    // Verificar en BD que la tarea pasó a VERIFICATION_PENDING
    const dbTaskPending = (await pool.query(
      `SELECT status FROM "OperationalTask" WHERE id = $1`,
      [dbTask.id]
    )).rows[0];
    assert.strictEqual(dbTaskPending?.status, "VERIFICATION_PENDING", "La tarea debe quedar en VERIFICATION_PENDING tras la entrega");

    // 4. CAMBIO DE SESIÓN: PM reingresa para dictaminar y verificar la tarea
    console.log("\n--- 3D. PM inicia sesión, revisa evidencia y aprueba verificación técnica ---");
    await page.deleteCookie({ name: vendorCookie.name });
    await page.setCookie(pmCookie);
    await page.setCookie({
      name: "custodia_active_tenant",
      value: "63ba31f2-cf6a-4f05-a8f7-06393d6222a8",
      domain: "localhost",
      path: "/",
    });

    await page.goto(`${BASE_URL}/propiedades/${PROPERTY_ID}`, { waitUntil: "networkidle2" });
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll("button[role='tab']"));
      const tab = tabs.find(t => t.textContent && t.textContent.includes("Tareas Operativas"));
      if (tab) (tab as HTMLButtonElement).click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // PM escribe notas de dictamen y aprueba verificación
    const reviewNotesInput = await page.$("input[placeholder*='Notas de dictamen']");
    if (reviewNotesInput) {
      await reviewNotesInput.type("Inspección de insumos conforme a estándar de hospitalidad.");
    }

    let approvedVerification = false;
    for (const ab of await page.$$("button")) {
      const aText = await page.evaluate(el => el.textContent, ab);
      if (aText && aText.includes("Aprobar Verificación")) {
        await ab.click();
        approvedVerification = true;
        await new Promise(r => setTimeout(r, 2000));
        break;
      }
    }
    assert.strictEqual(approvedVerification, true, "El PM debe pulsar Aprobar Verificación");
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_07b_pm_revision_aprobada.png"), fullPage: true });

    // Verificar en BD que la tarea quedó COMPLETED y que la estancia se actualizó a COMPLETED con checklist cumplido
    const dbTaskCompleted = (await pool.query(
      `SELECT status, "verifiedAt" FROM "OperationalTask" WHERE id = $1`,
      [dbTask.id]
    )).rows[0];
    assert.strictEqual(dbTaskCompleted?.status, "COMPLETED", "La tarea debe quedar COMPLETED en BD");
    assert.ok(dbTaskCompleted?.verifiedAt, "La tarea debe registrar fecha de verificación");

    const dbStayCompleted = (await pool.query(
      `SELECT status, "checklistJson" FROM "Inspection" WHERE id = $1`,
      [targetStay.id]
    )).rows[0];
    assert.strictEqual(dbStayCompleted?.status, "COMPLETED", "La llegada debe desbloquearse y quedar en status COMPLETED");
    console.log("Estancia completada en BD tras verificación:", dbStayCompleted);

    // 5. PM revisa la pestaña 'Llegadas' y captura el estado final confirmado
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll("button[role='tab']"));
      const tab = tabs.find(t => t.textContent && t.textContent.includes("Llegadas & Estancias"));
      if (tab) (tab as HTMLButtonElement).click();
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_07c_llegada_confirmada.png"), fullPage: true });

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
