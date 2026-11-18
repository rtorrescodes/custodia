const { chromium } = require('playwright');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/login');
  const title = await page.title();
  console.log('PAGE TITLE:', title);
  await page.screenshot({ path: 'tests/screenshots/test-chrome.png' });
  console.log('SCREENSHOT SAVED to tests/screenshots/test-chrome.png');
  await browser.close();
})();
