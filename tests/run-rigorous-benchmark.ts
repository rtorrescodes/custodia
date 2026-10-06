const puppeteer = require("puppeteer-core");
const { getCookies } = require("./auth-cookie-helper.cjs");
const fs = require("fs");
const path = require("path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3005"; // Servidor de producción local
const PROPERTY_ID = "f28e8fa3-63e8-4113-b620-0cf181e2363c"; // Villa Serena Residencial

interface MeasureItem {
  route: string;
  iteration: number;
  isWarmup: boolean;
  httpStatus: number;
  ttfbMs: number;
  usableContentMs: number;
  totalMs: number;
}

function calculateStats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  const mean = Math.round(sorted.reduce((acc, v) => acc + v, 0) / sorted.length);
  return { min, max, median, mean, range: `${min}ms - ${max}ms` };
}

async function runRigorousBenchmark() {
  console.log("================================================================================");
  console.log("🏛️ CUSTODIA: BENCHMARK RIGUROSO DE RENDIMIENTO EN PRODUCCIÓN LOCAL (Puerto 3005)");
  console.log("================================================================================\n");
  console.log("Condiciones de Medición:");
  console.log("- Runtime: Servidor local optimizado ('next start -p 3005')");
  console.log("- Protocolo: 1 sesión de precalentamiento (warm-up) descartada + 5 ejecuciones consecutivas");
  console.log("- Métricas: TTFB (Server response) + Tiempo hasta Elemento Clave Usable e Interactivo");
  console.log("- Rutas: 1) Ficha Inmueble (/propiedades/[id]), 2) Cartera PM (/cartera), 3) Portal Dueño (/portal)\n");

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1400,900"]
  });

  const routesToTest = [
    {
      name: "Ficha Inmueble (Villa Serena)",
      url: `${BASE_URL}/propiedades/${PROPERTY_ID}`,
      user: "pm@demo.custodia.app",
      targetSelector: "h1", // Título y Ficha de propiedad renderizada
      interactionSelector: "button"
    },
    {
      name: "Cartera PM (Bandeja Multipropiedad)",
      url: `${BASE_URL}/cartera`,
      user: "pm@demo.custodia.app",
      targetSelector: "h1", // Resumen de Cartera y listado
      interactionSelector: "button"
    },
    {
      name: "Portal Propietario (Liquidaciones y Fideicomiso)",
      url: `${BASE_URL}/portal?propertyId=${PROPERTY_ID}`,
      user: "propietario@demo.custodia.app",
      targetSelector: "div.p-8, header", // Contenedor renderizado del portal
      interactionSelector: ""
    }
  ];

  const resultsByRoute: Record<string, MeasureItem[]> = {};

  try {
    for (const routeCfg of routesToTest) {
      console.log(`--- Midiendo: ${routeCfg.name} ---`);
      resultsByRoute[routeCfg.name] = [];
      const page = await browser.newPage();
      await page.setViewport({ width: 1400, height: 900 });

      const cookie = await getCookies(routeCfg.user);
      await page.setCookie(cookie);

      // 1. Warm-up (descartado de la estadística final)
      console.log(`[Warm-up] Calentando caché de SSR y sesión...`);
      await page.goto(routeCfg.url, { waitUntil: "networkidle2" });
      await page.waitForSelector(routeCfg.targetSelector);
      await new Promise(r => setTimeout(r, 500));

      // 2. 5 Ejecuciones de prueba
      for (let i = 1; i <= 5; i++) {
        const start = Date.now();
        const response = await page.goto(routeCfg.url, { waitUntil: "domcontentloaded" });
        const httpStatus = response ? response.status() : 200;

        // Esperamos a que el elemento clave de datos y la interactividad estén listos
        await page.waitForSelector(routeCfg.targetSelector);
        if (routeCfg.interactionSelector) {
          await page.waitForSelector(routeCfg.interactionSelector);
        }
        const usableContentMs = Date.now() - start;

        // Extraer TTFB exacto del navegador
        const ttfbMs = await page.evaluate(() => {
          const nav = performance.getEntriesByType("navigation")[0];
          return nav ? Math.round(nav.responseStart - nav.requestStart) : 0;
        });

        const totalMs = usableContentMs;
        const item: MeasureItem = {
          route: routeCfg.name,
          iteration: i,
          isWarmup: false,
          httpStatus,
          ttfbMs,
          usableContentMs,
          totalMs
        };

        resultsByRoute[routeCfg.name].push(item);
        console.log(`  Run ${i}: TTFB = ${ttfbMs}ms | Contenido Usable = ${usableContentMs}ms (HTTP ${httpStatus})`);
        await new Promise(r => setTimeout(r, 300));
      }

      await page.close();
    }
  } finally {
    await browser.close();
  }

  // Generación de tabla y estadísticas
  console.log("\n================================================================================");
  console.log("📊 RESULTADOS CONSOLIDADOS (5 ITERACIONES POST WARM-UP)");
  console.log("================================================================================\n");

  const summaryReport: any[] = [];

  for (const [routeName, items] of Object.entries(resultsByRoute)) {
    const usableTimes = items.map(it => it.usableContentMs);
    const ttfbTimes = items.map(it => it.ttfbMs);
    const usableStats = calculateStats(usableTimes);
    const ttfbStats = calculateStats(ttfbTimes);

    summaryReport.push({
      Ruta: routeName,
      "Mediana Total": `${usableStats.median} ms`,
      "Rango Total": usableStats.range,
      "Promedio Total": `${usableStats.mean} ms`,
      "Mediana TTFB": `${ttfbStats.median} ms`,
      "Rango TTFB": ttfbStats.range,
      "Muestras Válidas": items.length
    });
  }

  console.table(summaryReport);

  const outputPath = path.join(__dirname, "rigorous-benchmark-report.json");
  fs.writeFileSync(outputPath, JSON.stringify({ summaryReport, raw: resultsByRoute }, null, 2));
  console.log(`\nReporte JSON guardado en: ${outputPath}`);
}

runRigorousBenchmark().catch(console.error);
