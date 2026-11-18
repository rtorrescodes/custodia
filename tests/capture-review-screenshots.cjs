require('dotenv').config();
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { getCookies } = require('./auth-cookie-helper.cjs');
const { Pool } = require('pg');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function captureUpdatedReviewScreenshots() {
  console.log('--- CAPTURANDO PANTALLAS DEFINITIVAS DE REVISIÓN ---');

  const propRes = await pool.query('SELECT id, name FROM "Property" WHERE name = $1', ['Villa Serena Residencial']);
  if (propRes.rows.length === 0) {
    throw new Error('Propiedad Villa Serena Residencial no encontrada.');
  }
  const propertyId = propRes.rows[0].id;
  console.log('Propiedad verificada:', propertyId);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // 1. SESIÓN PM: Ficha de la Propiedad (Escritorio)
  console.log('Iniciando sesión como PM...');
  const pmCookie = await getCookies('pm@demo.custodia.app');
  await page.setCookie(pmCookie);

  const t0_prop = Date.now();
  await page.goto(`${BASE_URL}/propiedades/${propertyId}`, { waitUntil: 'networkidle2' });
  const t_prop = Date.now() - t0_prop;
  console.log(`[PERFORMANCE] Carga Ficha Propiedad: ${t_prop} ms`);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_ficha_propiedad_desktop.png'), fullPage: true });
  console.log('Guardada: 01_ficha_propiedad_desktop.png');

  // Pestaña Gobernanza & Liquidación en Ficha
  const govTab = await page.$('button[value="governance"]');
  if (govTab) {
    await govTab.click();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_ficha_gobernanza_desktop.png'), fullPage: true });
    console.log('Guardada: 02_ficha_gobernanza_desktop.png');
  }

  // 2. SESIÓN PM: Bandeja de Cartera (Escritorio)
  const t0_cartera = Date.now();
  await page.goto(`${BASE_URL}/cartera`, { waitUntil: 'networkidle2' });
  const t_cartera = Date.now() - t0_cartera;
  console.log(`[PERFORMANCE] Carga Bandeja Cartera: ${t_cartera} ms`);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_bandeja_cartera_desktop.png'), fullPage: true });
  console.log('Guardada: 03_bandeja_cartera_desktop.png');

  // 3. SESIÓN PROPIETARIO: Portal del Dueño (Español & Multi-propiedad)
  console.log('Iniciando sesión como Propietario...');
  await page.deleteCookie({ name: pmCookie.name });
  const ownerCookie = await getCookies('propietario@demo.custodia.app');
  await page.setCookie(ownerCookie);

  const t0_portal = Date.now();
  await page.goto(`${BASE_URL}/portal?propertyId=${propertyId}`, { waitUntil: 'networkidle2' });
  const t_portal = Date.now() - t0_portal;
  console.log(`[PERFORMANCE] Carga Portal Propietario (ES): ${t_portal} ms`);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_portal_propietario_es.png'), fullPage: true });
  console.log('Guardada: 04_portal_propietario_es.png');

  // 4. SESIÓN PROPIETARIO: Portal en Inglés
  const t0_portal_en = Date.now();
  await page.goto(`${BASE_URL}/portal?propertyId=${propertyId}&lang=en`, { waitUntil: 'networkidle2' });
  const t_portal_en = Date.now() - t0_portal_en;
  console.log(`[PERFORMANCE] Carga Portal Propietario (EN): ${t_portal_en} ms`);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_portal_propietario_en.png'), fullPage: true });
  console.log('Guardada: 05_portal_propietario_en.png');

  // 5. SESIÓN PROPIETARIO: Vista Móvil (Viewport 390x844 - iPhone 14)
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${BASE_URL}/portal?propertyId=${propertyId}`, { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_portal_propietario_mobile.png'), fullPage: true });
  console.log('Guardada: 06_portal_propietario_mobile.png');

  // Vista Móvil Ficha Propiedad como PM
  await page.deleteCookie({ name: ownerCookie.name });
  await page.setCookie(pmCookie);
  await page.goto(`${BASE_URL}/propiedades/${propertyId}`, { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_ficha_propiedad_mobile.png'), fullPage: true });
  console.log('Guardada: 07_ficha_propiedad_mobile.png');

  await browser.close();
  await pool.end();

  console.log('\n--- RESUMEN DE RENDIMIENTO OBSERVADO (localhost:3000 con Supabase Auth) ---');
  console.log(`- Ficha Inmueble (/propiedades/[id]): ${t_prop} ms`);
  console.log(`- Bandeja de Cartera (/cartera): ${t_cartera} ms`);
  console.log(`- Portal Propietario ES (/portal): ${t_portal} ms`);
  console.log(`- Portal Propietario EN (/portal?lang=en): ${t_portal_en} ms`);
  console.log('--- CAPTURAS Y MEDICIONES FINALIZADAS CON ÉXITO ---');
}

captureUpdatedReviewScreenshots().catch(err => {
  console.error(err);
  process.exit(1);
});
