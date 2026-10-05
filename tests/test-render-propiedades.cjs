require('dotenv').config();
const http = require('http');
const https = require('https');

const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'DemoCustodia2026!';
const SUPABASE_HOST = 'ptfejkjyxrcmxslpuexo.supabase.co';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function loginGoTrue(email, password) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ email, password });
    const req = https.request({
      hostname: SUPABASE_HOST,
      path: '/auth/v1/token?grant_type=password',
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function fetchPage(path, cookies = {}) {
  return new Promise((resolve, reject) => {
    const cookieHeader = Object.entries(cookies)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('; ');

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      headers: {
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: body.substring(0, 300) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function testRender() {
  console.log('Login Casero en GoTrue...');
  const auth = await loginGoTrue('casero@demo.custodia.app', DEMO_PASSWORD);
  const cookieName = 'sb-ptfejkjyxrcmxslpuexo-auth-token';
  const payloadObj = {
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: auth.user
  };
  const b64 = 'base64-' + Buffer.from(JSON.stringify(payloadObj)).toString('base64');

  console.log('Solicitando GET /propiedades con sesión válida...');
  const res = await fetchPage('/propiedades', {
    [cookieName]: b64
  });

  console.log('Respuesta HTTP:', res.status);
  console.log('Sample Body:', res.body);
}

testRender().catch(console.error);
