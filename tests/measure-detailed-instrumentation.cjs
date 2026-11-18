const puppeteer = require("puppeteer-core");
const { getCookies } = require("./auth-cookie-helper.cjs");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3005";
const PROPERTY_ID = "f28e8fa3-63e8-4113-b620-0cf181e2363c"; // Villa Serena

async function runDetailedInstrumentedBenchmark() {
  console.log("=== INICIANDO BENCHMARK INSTRUMENTADO DETALLADO (Puerto 3005) ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1400,900"]
  });

  const detailedResults = [];

  async function measureInstrumented(page, url, label) {
    const startNav = Date.now();
    const response = await page.goto(url, { waitUntil: "networkidle2" });
    const totalTime = Date.now() - startNav;

    // Obtener métricas de PerformanceNavigationTiming del navegador
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      if (!nav) return null;
      return {
        // Espera de conexión y DNS
        connectTime: Math.round(nav.connectEnd - nav.connectStart),
        // TTFB (Time To First Byte - Respuesta del servidor que incluye Auth, DB y SSR)
        ttfb: Math.round(nav.responseStart - nav.requestStart),
        // Descarga de HTML
        responseDownload: Math.round(nav.responseEnd - nav.responseStart),
        // Tiempo de parseo y ejecución de JavaScript en cliente hasta DOM Interactivo
        domInteractive: Math.round(nav.domInteractive - nav.responseEnd),
        // Contenido principal listo (DOM Content Loaded)
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.responseEnd),
        // Carga completa con todos los assets
        loadEvent: Math.round(nav.loadEventEnd - nav.startTime)
      };
    });

    const status = response ? response.status() : "none";
    const record = {
      label,
      totalTime,
      status,
      serverTTFB: timing?.ttfb || "N/A",
      clientParsingAndRender: timing?.domContentLoaded || "N/A",
      connectTime: timing?.connectTime || 0,
    };
    detailedResults.push(record);
    console.log(`[${label}] Total: ${totalTime}ms | Servidor (TTFB/Auth/DB/SSR): ${record.serverTTFB}ms | Cliente (Parse/Render/Interactividad): ${record.clientParsingAndRender}ms (HTTP ${status})`);
    return record;
  }

  try {
    // 1. SESIÓN PM
    console.log("\n--- Instrumentación Sesión PM ---");
    const pmPage = await browser.newPage();
    const pmCookie = await getCookies("pm@demo.custodia.app");
    await pmPage.setCookie(pmCookie);

    await measureInstrumented(pmPage, `${BASE_URL}/propiedades/${PROPERTY_ID}`, "Ficha Inmueble - Run 1 (Cold)");
    await measureInstrumented(pmPage, `${BASE_URL}/propiedades/${PROPERTY_ID}`, "Ficha Inmueble - Run 2 (Warm)");
    await measureInstrumented(pmPage, `${BASE_URL}/propiedades/${PROPERTY_ID}`, "Ficha Inmueble - Run 3 (Warm)");

    await measureInstrumented(pmPage, `${BASE_URL}/cartera`, "Cartera PM - Run 1 (Cold)");
    await measureInstrumented(pmPage, `${BASE_URL}/cartera`, "Cartera PM - Run 2 (Warm)");
    await measureInstrumented(pmPage, `${BASE_URL}/cartera`, "Cartera PM - Run 3 (Warm)");
    await pmPage.close();

    // 2. SESIÓN PROPIETARIO
    console.log("\n--- Instrumentación Sesión Propietario ---");
    const ownerPage = await browser.newPage();
    const ownerCookie = await getCookies("propietario@demo.custodia.app");
    await ownerPage.setCookie(ownerCookie);

    await measureInstrumented(ownerPage, `${BASE_URL}/portal?propertyId=${PROPERTY_ID}`, "Portal Dueño - Run 1 (Cold)");
    await measureInstrumented(ownerPage, `${BASE_URL}/portal?propertyId=${PROPERTY_ID}`, "Portal Dueño - Run 2 (Warm)");
    await measureInstrumented(ownerPage, `${BASE_URL}/portal?propertyId=${PROPERTY_ID}`, "Portal Dueño - Run 3 (Warm)");
    await ownerPage.close();

  } finally {
    await browser.close();
  }

  console.log("\n=== RESUMEN DE ETAPAS DE RENDIMIENTO (SERVIDOR VS CLIENTE) ===");
  console.table(detailedResults);
}

runDetailedInstrumentedBenchmark().catch(console.error);
