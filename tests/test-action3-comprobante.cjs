require('dotenv').config();
const puppeteer = require('puppeteer-core');
const { getCookies } = require('./auth-cookie-helper.cjs');
const path = require('path');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
  });
  const page = await browser.newPage();
  const ownerCookie = await getCookies('propietario@demo.custodia.app');
  await page.setCookie(ownerCookie);

  page.on('dialog', async d => {
    console.log('[PROMPT/ALERT]:', d.message());
    if (d.type() === 'prompt') await d.accept('SPEI-REF-BANCOMER-554433');
    else await d.accept();
  });

  const url = 'http://localhost:3000/portal?propertyId=f28e8fa3-63e8-4113-b620-0cf181e2363c';
  await page.goto(url, { waitUntil: 'networkidle2' });

  let clicked = false;
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const text = await page.evaluate(el => el.textContent, b);
    if (text && text.includes('Adjuntar Comprobante')) {
      console.log('Botón "Adjuntar Comprobante" encontrado. Haciendo click...');
      await b.click();
      clicked = true;
      break;
    }
  }

  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'accion3_02_comprobante_reportado.png'), fullPage: true });

  const contribDb = (await pool.query(`
    SELECT id, amount, status, "evidenceUrl", "reportedAt", "verifiedAt"
    FROM "OwnerContribution"
    WHERE "propertyId" = $1
  `, ['f28e8fa3-63e8-4113-b620-0cf181e2363c'])).rows[0];
  console.log('ESTADO DB TRAS ADJUNTAR:', contribDb);

  await browser.close();
  await pool.end();
}

run().catch(console.error);
