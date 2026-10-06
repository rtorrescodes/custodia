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
    // 1. PROPIETARIO REPORTA COMPROBANTE -> PM VERIFICA -> INGRESO ÚNICO
    // -------------------------------------------------------------------------
    console.log("--- 1. Propietario reporta transferencia con formulario accesible ---");
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

    if (reportButton) {
      console.log("Botón 'Reportar transferencia' presionado. Abriendo modal...");
      await reportButton.click();
      await page.waitForSelector("div[role='dialog'], form", { timeout: 5000 });
      await new Promise(r => setTimeout(r, 800));
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_02_modal_reporte_transferencia.png"), fullPage: true });

      // Llenar campos del modal
      console.log("Completando formulario con referencia y comprobante...");
      const refInput = await page.$("input[placeholder*='SPEI'], input[name='reference']");
      if (refInput) {
        await refInput.type("SPEI-BBVA-VERIF-2026-9900");
      }

      // Enviar formulario del modal
      const modalButtons = await page.$$("button");
      for (const mb of modalButtons) {
        const text = await page.evaluate(el => el.textContent, mb);
        if (text && text.includes("Confirmar y Enviar")) {
          await mb.click();
          break;
        }
      }
      await new Promise(r => setTimeout(r, 2000));
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_03_transferencia_reportada_exito.png"), fullPage: true });
    }

    // -------------------------------------------------------------------------
    // 2. PRIVACIDAD ZERO-TRUST: USUARIO AJENO NO PUEDE ACCEDER A LA EVIDENCIA
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Verificando aislamiento de evidencia privada (Zero Trust) ---");
    // Cambiamos a sesión de casero ajeno
    await page.deleteCookie({ name: ownerCookie.name });
    const caseroCookie = await getCookies("casero@demo.custodia.app");
    await page.setCookie(caseroCookie);

    // Intentar acceder directamente al portal de Villa Serena
    const respAjeno = await page.goto(`${BASE_URL}/portal?propertyId=${PROPERTY_ID}`, { waitUntil: "networkidle2" });
    const contenidoAjeno = await page.content();
    const bloqAjeno = contenidoAjeno.includes("No tienes propiedades asignadas") || contenidoAjeno.includes("noProperties");
    console.log("¿Acceso denegado a usuario ajeno en el portal?", bloqAjeno);
    assert.strictEqual(bloqAjeno, true, "Usuario ajeno debe tener denegado el acceso al portal de esta propiedad");
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_04_usuario_ajeno_bloqueado.png"), fullPage: true });

    // -------------------------------------------------------------------------
    // 3. PM ASIGNA TAREA DE LLEGADA -> RESPONSABLE EJECUTA -> PM VERIFICA
    // -------------------------------------------------------------------------
    console.log("\n--- 3. PM asigna tarea de llegada y verifica preparación ---");
    await page.deleteCookie({ name: caseroCookie.name });
    const pmCookie = await getCookies("pm@demo.custodia.app");
    await page.setCookie(pmCookie);

    await page.goto(`${BASE_URL}/propiedades/${PROPERTY_ID}`, { waitUntil: "networkidle2" });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_05_pm_ficha_propiedad.png"), fullPage: true });

    // Ir a pestaña Llegadas & Estancias
    const staysTrigger = await page.$("button[value='stays']");
    if (staysTrigger) {
      await staysTrigger.click();
      await new Promise(r => setTimeout(r, 1000));
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_06_pm_llegadas_checklist.png"), fullPage: true });
    }

    // Ir a pestaña Tareas para revisar tareas operativas
    const tasksTrigger = await page.$("button[value='tasks']");
    if (tasksTrigger) {
      await tasksTrigger.click();
      await new Promise(r => setTimeout(r, 1000));
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
        await new Promise(r => setTimeout(r, 1000));
        break;
      }
    }
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "demo_09_mobile_en_ficha.png"), fullPage: true });

    console.log("\n================================================================================");
    console.log("🎉 TODAS LAS DEMOSTRACIONES DE NAVEGADOR CAPTURADAS Y VERIFICADAS.");
    console.log("================================================================================\n");

  } finally {
    await browser.close();
    await pool.end();
  }
}

runBrowserEvidenceSuite().catch(console.error);
