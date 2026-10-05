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

async function runFullProductReview() {
  console.log('=== INICIANDO VALIDACIÓN PRÁCTICA Y NAVEGACIÓN EN CUSTODIA ===');
  
  const propRes = await pool.query('SELECT id, name FROM "Property" WHERE name = $1', ['Villa Serena Residencial']);
  if (propRes.rows.length === 0) throw new Error('Propiedad Villa Serena Residencial no encontrada');
  const villaId = propRes.rows[0].id;

  const prop2Res = await pool.query('SELECT id, name FROM "Property" WHERE name = $1', ['Torre Marena PH2']);
  const marenaId = prop2Res.rows[0].id;

  console.log('Villa Serena ID:', villaId);
  console.log('Torre Marena ID:', marenaId);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Manejador de diálogos (prompts/alerts)
  page.on('dialog', async dialog => {
    console.log(`[DIALOG (${dialog.type()})]: ${dialog.message()}`);
    if (dialog.type() === 'prompt') {
      await dialog.accept('SPEI-REF-99887766');
    } else {
      await dialog.accept();
    }
  });

  // ----------------------------------------------------
  // MEDICIÓN DE RENDIMIENTO (WARM VS COLD)
  // ----------------------------------------------------
  console.log('\n--- EVALUACIÓN DE RENDIMIENTO: COLD VS WARM NAVIGATIONS ---');
  const pmCookie = await getCookies('pm@demo.custodia.app');
  await page.setCookie(pmCookie);

  // Navegación 1 a Ficha (Warm dev)
  const t0_p1 = Date.now();
  await page.goto(`${BASE_URL}/propiedades/${villaId}`, { waitUntil: 'networkidle2' });
  const t_p1 = Date.now() - t0_p1;
  console.log(`[MEDICIÓN RENDIMIENTO] Navegación Ficha Propiedad (Dev Warm 1): ${t_p1} ms`);

  // Navegación 2 a Ficha (Cacheada en memoria dev)
  const t0_p2 = Date.now();
  await page.goto(`${BASE_URL}/propiedades/${villaId}`, { waitUntil: 'networkidle2' });
  const t_p2 = Date.now() - t0_p2;
  console.log(`[MEDICIÓN RENDIMIENTO] Navegación Ficha Propiedad (Dev Warm 2): ${t_p2} ms`);

  // ----------------------------------------------------
  // ACCIÓN 1: COMO PROPIETARIO, APROBAR IMPERMEABILIZACIÓN SIN FONDOS
  // ----------------------------------------------------
  console.log('\n--- ACCIÓN 1: PROPIETARIO APRUEBA IMPERMEABILIZACIÓN SIN FONDOS ---');
  await page.deleteCookie({ name: pmCookie.name });
  const ownerCookie = await getCookies('propietario@demo.custodia.app');
  await page.setCookie(ownerCookie);

  await page.goto(`${BASE_URL}/portal?propertyId=${villaId}`, { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'accion1_01_portal_antes_aprobar.png'), fullPage: true });

  // Buscar botón "Aprobar Cotización" para Impermeabilización
  const buttons = await page.$$('button');
  let approveBtn = null;
  for (const b of buttons) {
    const text = await page.evaluate(el => el.textContent, b);
    if (text && text.includes('Aprobar Cotización')) {
      approveBtn = b;
      break;
    }
  }

  if (approveBtn) {
    console.log('Botón "Aprobar Cotización" localizado. Haciendo click...');
    await approveBtn.click();
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'accion1_02_portal_despues_aprobar.png'), fullPage: true });
    console.log('Cotización aprobada por el propietario desde el Portal.');
  } else {
    console.log('ADVERTENCIA: No se encontró botón Aprobar Cotización (¿ya estaba aprobada o no visible?)');
  }

  // Verificar estado en DB
  const quoteDb = (await pool.query(`
    SELECT q.id, q.status, q."totalCost", w.title, w.status as wo_status
    FROM "WorkOrderQuote" q
    JOIN "WorkOrder" w ON q."workOrderId" = w.id
    WHERE w.title = $1
  `, ['Impermeabilización Azotea y Sellado'])).rows[0];
  console.log('Estado DB Impermeabilización tras aprobación:', quoteDb);

  // ----------------------------------------------------
  // ACCIÓN 2: COMPROBAR COMO PM QUÉ CAMBIÓ Y QUÉ FALTA
  // ----------------------------------------------------
  console.log('\n--- ACCIÓN 2: COMO PM COMPROBAR QUÉ CAMBIÓ Y QUÉ FALTA EN LA FICHA ---');
  await page.deleteCookie({ name: ownerCookie.name });
  await page.setCookie(pmCookie);

  await page.goto(`${BASE_URL}/propiedades/${villaId}`, { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'accion2_01_ficha_pm_gastos.png'), fullPage: true });

  // Click a la nueva pestaña "Tareas Operativas"
  const tasksTab = await page.$('button[value="tasks"]');
  if (tasksTab) {
    await tasksTab.click();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'accion2_02_ficha_pm_tareas.png'), fullPage: true });
  }

  // Click a la pestaña "Pagos al Propietario"
  const settlementsTab = await page.$('button[value="settlements"]');
  if (settlementsTab) {
    await settlementsTab.click();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'accion2_03_ficha_pm_pagos.png'), fullPage: true });
  }

  // ----------------------------------------------------
  // ACCIÓN 3: REPORTAR APORTACIÓN COMO PROPIETARIO & VERIFICAR DISPONIBLE
  // ----------------------------------------------------
  console.log('\n--- ACCIÓN 3: PROPIETARIO REPORTA APORTACIÓN Y VERIFICA SALDO DISPONIBLE ---');
  await page.deleteCookie({ name: pmCookie.name });
  await page.setCookie(ownerCookie);

  await page.goto(`${BASE_URL}/portal?propertyId=${villaId}`, { waitUntil: 'networkidle2' });
  
  // Buscar botón "Reportar Transferencia / Comprobante"
  const buttonsOwner = await page.$$('button');
  let reportBtn = null;
  for (const b of buttonsOwner) {
    const text = await page.evaluate(el => el.textContent, b);
    if (text && text.includes('Reportar Transferencia')) {
      reportBtn = b;
      break;
    }
  }

  if (reportBtn) {
    console.log('Botón "Reportar Transferencia" localizado. Haciendo click...');
    await reportBtn.click();
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'accion3_01_portal_despues_reportar.png'), fullPage: true });
  } else {
    console.log('ADVERTENCIA: No se encontró botón Reportar Transferencia');
  }

  // Verificar en DB que la aportación esté en 'REPORTED' y que el saldo fiduciario siga disponible en $0
  const contribDb = (await pool.query(`
    SELECT id, amount, status, "evidenceUrl", "reportedAt"
    FROM "OwnerContribution"
    WHERE "propertyId" = $1
  `, [villaId])).rows[0];
  console.log('Estado DB Aportación tras reporte:', contribDb);

  // ----------------------------------------------------
  // ACCIÓN 4: CAMBIAR DE INMUEBLE Y DE IDIOMA
  // ----------------------------------------------------
  console.log('\n--- ACCIÓN 4: NAVEGACIÓN MULTIPROPIEDAD Y CAMBIO DE IDIOMA ---');
  // Navegación directa y cambio por select
  await page.goto(`${BASE_URL}/portal?propertyId=${marenaId}&lang=es`, { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'accion4_01_portal_marena_es.png'), fullPage: true });

  await page.goto(`${BASE_URL}/portal?propertyId=${marenaId}&lang=en`, { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'accion4_02_portal_marena_en.png'), fullPage: true });

  // Regreso a Villa Serena en Inglés
  await page.goto(`${BASE_URL}/portal?propertyId=${villaId}&lang=en`, { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'accion4_03_portal_villa_en.png'), fullPage: true });

  // ----------------------------------------------------
  // ACCIÓN 5: ABRIR LA LLEGADA PENDIENTE Y REVISAR SUMINISTROS
  // ----------------------------------------------------
  console.log('\n--- ACCIÓN 5: ABRIR LLEGADA PENDIENTE Y REVISAR RESPONSABLE DE SUMINISTROS ---');
  await page.deleteCookie({ name: ownerCookie.name });
  await page.setCookie(pmCookie);

  await page.goto(`${BASE_URL}/propiedades/${villaId}`, { waitUntil: 'networkidle2' });
  
  // Click a la pestaña "Llegadas & Estancias"
  const staysTab = await page.$('button[value="stays"]');
  if (staysTab) {
    await staysTab.click();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'accion5_01_llegadas_estancias.png'), fullPage: true });
  }

  // Click a la pestaña "Suministros"
  const suppliesTab = await page.$('button[value="supplies"]');
  if (suppliesTab) {
    await suppliesTab.click();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'accion5_02_suministros_inventario.png'), fullPage: true });
  }

  console.log('\n=== RECORRIDO COMPLETO TERMINADO EXITOSAMENTE ===');
  await browser.close();
  await pool.end();
}

runFullProductReview().catch(err => {
  console.error('Error durante la revisión:', err);
  process.exit(1);
});
