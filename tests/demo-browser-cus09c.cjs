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

async function runDemo() {
  console.log('--- INICIANDO DEMOSTRACIÓN DE NAVEGADOR REAL CUS-09C ---');

  // Obtener IDs clave
  const propRes = await pool.query('SELECT id, name FROM "Property" WHERE name = $1', ['Villa Serena Demo CUS-09C']);
  if (propRes.rows.length === 0) {
    throw new Error('Propiedad de prueba no encontrada. Ejecutar seed primero.');
  }
  const propertyId = propRes.rows[0].id;
  console.log('Propiedad sintética verificada:', propertyId);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // 1. Sesión como PM (pm@demo.custodia.app)
  console.log('Obteniendo credenciales reales de PM...');
  const pmCookie = await getCookies('pm@demo.custodia.app');
  await page.setCookie(pmCookie);

  // R1: Visita a la propiedad como PM
  console.log('Navegando a la propiedad como PM:', `${BASE_URL}/propiedades/${propertyId}`);
  await page.goto(`${BASE_URL}/propiedades/${propertyId}`, { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'R1_pm_property_detail.png'), fullPage: true });
  console.log('Captura guardada: R1_pm_property_detail.png');

  // Pestaña Operaciones como PM
  const opTab = await page.$('button[value="operations"]');
  if (opTab) {
    await opTab.click();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'R1_pm_operations_tab.png'), fullPage: true });
    console.log('Captura guardada: R1_pm_operations_tab.png');
  }

  // R1: Propietario en su Portal (/portal)
  console.log('Cambiando a sesión de Propietario (propietario@demo.custodia.app)...');
  await page.deleteCookie({ name: pmCookie.name });
  const ownerCookie = await getCookies('propietario@demo.custodia.app');
  await page.setCookie(ownerCookie);

  console.log('Navegando al Portal del Propietario:', `${BASE_URL}/portal`);
  await page.goto(`${BASE_URL}/portal`, { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'R1_owner_portal_view.png'), fullPage: true });
  console.log('Captura guardada: R1_owner_portal_view.png');

  // Portal en modo inglés (Bilingüe)
  await page.goto(`${BASE_URL}/portal?lang=en`, { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'R7_owner_portal_english.png'), fullPage: true });
  console.log('Captura guardada: R7_owner_portal_english.png');

  // R2 / R3 / R4 / R5 / R6: Visitas directas y estado fiduciario en Cartera
  console.log('Cambiando de nuevo a sesión de PM para Cartera y Rentas...');
  await page.deleteCookie({ name: ownerCookie.name });
  await page.setCookie(pmCookie);

  await page.goto(`${BASE_URL}/cartera`, { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'R2_pm_cartera_financial_truth.png'), fullPage: true });
  console.log('Captura guardada: R2_pm_cartera_financial_truth.png');

  await page.goto(`${BASE_URL}/rentas`, { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'R6_pm_rentas_and_leases.png'), fullPage: true });
  console.log('Captura guardada: R6_pm_rentas_and_leases.png');

  // Pestaña Stays (Llegadas / Cuidado) en la propiedad
  await page.goto(`${BASE_URL}/propiedades/${propertyId}`, { waitUntil: 'networkidle2' });
  const staysTab = await page.$('button[value="stays"]');
  if (staysTab) {
    await staysTab.click();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'R3_R4_pm_stays_and_care.png'), fullPage: true });
    console.log('Captura guardada: R3_R4_pm_stays_and_care.png');
  }

  // Pestaña Mantenimiento y Proveedores
  await page.goto(`${BASE_URL}/mantenimiento`, { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'R2_pm_mantenimiento_orders.png'), fullPage: true });
  console.log('Captura guardada: R2_pm_mantenimiento_orders.png');

  await browser.close();
  await pool.end();
  console.log('--- DEMOSTRACIÓN COMPLETADA EXITOSAMENTE ---');
}

runDemo().catch(err => {
  console.error('Error durante la demostración:', err);
  process.exit(1);
});
