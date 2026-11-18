const puppeteer = require("puppeteer-core");
const { getCookies } = require("./auth-cookie-helper.cjs");
const path = require("path");
const fs = require("fs");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3005";
const PROPERTY_ID = "f28e8fa3-63e8-4113-b620-0cf181e2363c"; // Villa Serena

async function measureNavigation(page, url, name) {
  const start = Date.now();
  const response = await page.goto(url, { waitUntil: "networkidle2" });
  const duration = Date.now() - start;
  const status = response ? response.status() : "none";
  return { name, duration, status };
}

async function runBenchmark() {
  console.log("=== INICIANDO BENCHMARK EN PRODUCCIÓN LOCAL (Puerto 3005) ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1400,900"]
  });

  const results = [];

  try {
    // 1. SESIÓN PM
    console.log("\n--- Midiendo Sesión PM (pm@demo.custodia.app) ---");
    const pmPage = await browser.newPage();
    const pmCookie = await getCookies("pm@demo.custodia.app");
    await pmPage.setCookie(pmCookie);

    // Medición 1: Ficha de Inmueble (Cold SSR y navegaciones subsecuentes)
    const propertyUrl = `${BASE_URL}/propiedades/${PROPERTY_ID}`;
    console.log(`Midiendo Ficha de Inmueble: ${propertyUrl}`);
    
    // Cold run
    const coldFicha = await measureNavigation(pmPage, propertyUrl, "Ficha Inmueble (Cold SSR)");
    results.push(coldFicha);
    console.log(`  [Cold] ${coldFicha.name}: ${coldFicha.duration}ms (Status: ${coldFicha.status})`);

    // Warm run 1
    const warmFicha1 = await measureNavigation(pmPage, propertyUrl, "Ficha Inmueble (Warm Run 1)");
    results.push(warmFicha1);
    console.log(`  [Warm 1] ${warmFicha1.name}: ${warmFicha1.duration}ms`);

    // Warm run 2
    const warmFicha2 = await measureNavigation(pmPage, propertyUrl, "Ficha Inmueble (Warm Run 2)");
    results.push(warmFicha2);
    console.log(`  [Warm 2] ${warmFicha2.name}: ${warmFicha2.duration}ms`);

    // Medición 2: Cartera (Cold y Warm)
    const carteraUrl = `${BASE_URL}/cartera`;
    console.log(`\nMidiendo Cartera: ${carteraUrl}`);
    const coldCartera = await measureNavigation(pmPage, carteraUrl, "Cartera (Cold SSR)");
    results.push(coldCartera);
    console.log(`  [Cold] ${coldCartera.name}: ${coldCartera.duration}ms`);

    const warmCartera1 = await measureNavigation(pmPage, carteraUrl, "Cartera (Warm Run 1)");
    results.push(warmCartera1);
    console.log(`  [Warm 1] ${warmCartera1.name}: ${warmCartera1.duration}ms`);

    const warmCartera2 = await measureNavigation(pmPage, carteraUrl, "Cartera (Warm Run 2)");
    results.push(warmCartera2);
    console.log(`  [Warm 2] ${warmCartera2.name}: ${warmCartera2.duration}ms`);

    await pmPage.close();

    // 2. SESIÓN PROPIETARIO
    console.log("\n--- Midiendo Sesión Propietario (propietario@demo.custodia.app) ---");
    const ownerPage = await browser.newPage();
    const ownerCookie = await getCookies("propietario@demo.custodia.app");
    await ownerPage.setCookie(ownerCookie);

    const portalUrl = `${BASE_URL}/portal?propertyId=${PROPERTY_ID}`;
    console.log(`Midiendo Portal del Dueño: ${portalUrl}`);

    const coldPortal = await measureNavigation(ownerPage, portalUrl, "Portal Propietario (Cold SSR)");
    results.push(coldPortal);
    console.log(`  [Cold] ${coldPortal.name}: ${coldPortal.duration}ms`);

    const warmPortal1 = await measureNavigation(ownerPage, portalUrl, "Portal Propietario (Warm Run 1)");
    results.push(warmPortal1);
    console.log(`  [Warm 1] ${warmPortal1.name}: ${warmPortal1.duration}ms`);

    const warmPortal2 = await measureNavigation(ownerPage, portalUrl, "Portal Propietario (Warm Run 2)");
    results.push(warmPortal2);
    console.log(`  [Warm 2] ${warmPortal2.name}: ${warmPortal2.duration}ms`);

    await ownerPage.close();

  } finally {
    await browser.close();
  }

  // Guardar resultados en JSON
  fs.writeFileSync(
    path.join(__dirname, "benchmark-production-results.json"),
    JSON.stringify(results, null, 2)
  );

  console.log("\n=== RESUMEN ESTADÍSTICO DE RENDIMIENTO EN PRODUCCIÓN ===");
  console.table(results);
}

runBenchmark().catch(console.error);
