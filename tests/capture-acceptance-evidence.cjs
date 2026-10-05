const puppeteer = require("puppeteer-core");
const { getCookies } = require("./auth-cookie-helper.cjs");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3005";
const PROPERTY_ID = "f28e8fa3-63e8-4113-b620-0cf181e2363c"; // Villa Serena

async function captureEvidence() {
  console.log("=== CAPTURANDO EVIDENCIAS DE ACCEPTACIÓN REAL EN PRODUCCIÓN LOCAL ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1400,900"]
  });

  try {
    const ownerCookie = await getCookies("propietario@demo.custodia.app");
    const pmCookie = await getCookies("pm@demo.custodia.app");

    // 1. CAPTURA A: Portal del Dueño con desglose comprensible de reserva y aportación con comprobante
    const ownerPage = await browser.newPage();
    await ownerPage.setCookie(ownerCookie);
    await ownerPage.goto(`${BASE_URL}/portal?propertyId=${PROPERTY_ID}`, { waitUntil: "networkidle2" });
    await ownerPage.screenshot({
      path: path.join(__dirname, "screenshots", "demostracion_A_portal_reserva_y_transferencia.png"),
      fullPage: true,
    });
    console.log("✓ Captura A guardada: demostracion_A_portal_reserva_y_transferencia.png");
    await ownerPage.close();

    // 2. CAPTURA B: Ficha PM - Llegadas y Asignación de Responsable Real
    const pmPage = await browser.newPage();
    await pmPage.setCookie(pmCookie);
    await pmPage.goto(`${BASE_URL}/propiedades/${PROPERTY_ID}`, { waitUntil: "networkidle2" });
    
    // Cambiar a pestaña de Llegadas & Estancias
    await pmPage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Llegadas"));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 600));

    await pmPage.screenshot({
      path: path.join(__dirname, "screenshots", "demostracion_B_ficha_pm_llegadas_responsable.png"),
      fullPage: true,
    });
    console.log("✓ Captura B guardada: demostracion_B_ficha_pm_llegadas_responsable.png");

    // 3. CAPTURA C: Ficha PM - Pestaña Pagos a Proveedores separada de Liquidaciones al Propietario
    await pmPage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Pagos a Proveedores"));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 600));

    await pmPage.screenshot({
      path: path.join(__dirname, "screenshots", "demostracion_C_ficha_pm_pagos_proveedores.png"),
      fullPage: true,
    });
    console.log("✓ Captura C guardada: demostracion_C_ficha_pm_pagos_proveedores.png");

    // 4. CAPTURA D: Ficha PM - Pestaña Liquidaciones al Propietario
    await pmPage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Liquidaciones al Propietario"));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 600));

    await pmPage.screenshot({
      path: path.join(__dirname, "screenshots", "demostracion_D_ficha_pm_liquidaciones_propietario.png"),
      fullPage: true,
    });
    console.log("✓ Captura D guardada: demostracion_D_ficha_pm_liquidaciones_propietario.png");

    // 5. CAPTURA E: Ficha PM - Gastos y Órdenes con estado 'Aprobada, pendiente de fondos'
    await pmPage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Gastos"));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 600));

    await pmPage.screenshot({
      path: path.join(__dirname, "screenshots", "demostracion_E_ficha_pm_orden_aprobada_fondos.png"),
      fullPage: true,
    });
    console.log("✓ Captura E guardada: demostracion_E_ficha_pm_orden_aprobada_fondos.png");

    await pmPage.close();
  } finally {
    await browser.close();
  }
  console.log("=== TODAS LAS CAPTURAS COMPLETADAS CON ÉXITO ===");
}

captureEvidence().catch(console.error);
