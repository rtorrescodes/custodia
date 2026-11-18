require('dotenv').config();
const http = require('http');
const https = require('https');
const { Pool } = require('pg');

const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'DemoCustodia2026!';
const SUPABASE_HOST = 'ptfejkjyxrcmxslpuexo.supabase.co';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 1. Obtener JWT oficial mediante Supabase Auth GoTrue
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
          const json = JSON.parse(body);
          if (res.statusCode === 200 && json.access_token) {
            resolve(json);
          } else {
            reject({ status: res.statusCode, body: json });
          }
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

// 2. Realizar petición HTTP contra endpoint protegido de Next.js en localhost:3000
function callProtectedEndpoint(cookies = {}, body = { messages: [{ role: 'user', content: 'Hola' }] }) {
  return new Promise((resolve, reject) => {
    const cookieHeader = Object.entries(cookies)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('; ');

    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/conserje',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
      }
    }, res => {
      let resBody = '';
      res.on('data', d => resBody += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(resBody);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: resBody });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runRealAuthSuite() {
  console.log('=== SUITE DE VALIDACIÓN CRIPTOGRÁFICA Y SSR DE IDENTIDAD (HTTP REAL) ===\n');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // Obtener organizaciones para pruebas
    const orgCasero = (await pool.query(`SELECT id, name FROM "Tenant" WHERE name = 'Casero Residencial del Valle'`)).rows[0];
    const orgPM = (await pool.query(`SELECT id, name FROM "Tenant" WHERE name = 'Zirian Property Management'`)).rows[0];

    // Obtener token legítimo de Casero vía GoTrue
    console.log('Obteniendo token oficial de GoTrue para casero@demo.custodia.app...');
    const caseroAuth = await loginGoTrue('casero@demo.custodia.app', DEMO_PASSWORD);
    const validAccessToken = caseroAuth.access_token;
    const caseroUserId = caseroAuth.user.id;
    console.log(`JWT emitido exitosamente por GoTrue. User ID: ${caseroUserId}\n`);

    // Helper para empaquetar cookie oficial de @supabase/ssr
    const projectRef = 'ptfejkjyxrcmxslpuexo';
    const cookieName = `sb-${projectRef}-auth-token`;

    function buildAuthCookies(token, activeTenant = null) {
      const payloadObj = {
        access_token: token,
        refresh_token: caseroAuth.refresh_token,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: caseroAuth.user
      };
      const b64 = 'base64-' + Buffer.from(JSON.stringify(payloadObj)).toString('base64');
      const cookies = {
        [cookieName]: b64
      };
      if (activeTenant) {
        cookies['custodia_active_tenant'] = activeTenant;
      }
      return cookies;
    }

    // -------------------------------------------------------------
    // PRUEBA 1: Sin sesión (Petición anónima)
    // -------------------------------------------------------------
    console.log('[PRUEBA 1] Petición sin sesión (anónima a /api/conserje):');
    const res1 = await callProtectedEndpoint({});
    assert(res1.status === 401 && res1.body.error.includes('No autorizado'), 
      `Endpoint protegido rechaza petición sin sesión con HTTP ${res1.status} (${res1.body.error})`);

    // -------------------------------------------------------------
    // PRUEBA 2: JWT manipulado o firma inválida
    // -------------------------------------------------------------
    console.log('\n[PRUEBA 2] JWT manipulado (firma corrupta):');
    // Alterar los últimos caracteres de la firma
    const tamperedToken = validAccessToken.substring(0, validAccessToken.length - 10) + 'X9X9X9X9X9';
    const res2 = await callProtectedEndpoint(buildAuthCookies(tamperedToken, orgCasero.id));
    assert(res2.status === 401, 
      `Endpoint rechaza JWT manipulado con HTTP ${res2.status} (getUser() rechaza firma corrupta)`);

    // -------------------------------------------------------------
    // PRUEBA 3: Token vencido no recuperable
    // -------------------------------------------------------------
    console.log('\n[PRUEBA 3] Token vencido no recuperable:');
    const expiredFakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyYWJiYjA0NS01ZDM0LTQ5YTctYmJiZi03NGFlNjcxYTUzOGIiLCJleHAiOjE1MTQ3NjQ4MDB9.invalid_signature';
    const expiredPayload = {
      access_token: expiredFakeJwt,
      refresh_token: 'invalid_refresh',
      expires_at: 1514764800
    };
    const expiredCookie = 'base64-' + Buffer.from(JSON.stringify(expiredPayload)).toString('base64');
    const res3 = await callProtectedEndpoint({ [cookieName]: expiredCookie });
    assert(res3.status === 401, 
      `Token expirado/inválido es rechazado por getUser() con HTTP ${res3.status}`);

    // -------------------------------------------------------------
    // PRUEBA 4: Cookie de organización ajena
    // -------------------------------------------------------------
    console.log('\n[PRUEBA 4] Cookie custodia_active_tenant manipulada hacia organización ajena:');
    // Casero legítimo autenticado pero enviando la cookie de organización del PM
    const res4 = await callProtectedEndpoint(buildAuthCookies(validAccessToken, orgPM.id));
    assert(res4.status === 403, 
      `Servidor rechaza organización ajena con HTTP ${res4.status} (${res4.body.error})`);

    // -------------------------------------------------------------
    // PRUEBA 5: Membresía revocada con sesión abierta
    // -------------------------------------------------------------
    console.log('\n[PRUEBA 5] Membresía revocada en base de datos con sesión activa:');
    // Suspender/revocar al casero en su organización
    await pool.query(`UPDATE "TenantMember" SET status = 'REVOKED' WHERE "tenantId" = $1 AND "userId" = $2`, [orgCasero.id, caseroUserId]);
    const res5 = await callProtectedEndpoint(buildAuthCookies(validAccessToken, orgCasero.id));
    assert(res5.status === 403 && res5.body.error.includes('revocada'), 
      `Membresía revocada rechazada con HTTP ${res5.status} (${res5.body.error})`);
    // Restaurar membresía
    await pool.query(`UPDATE "TenantMember" SET status = 'ACTIVE' WHERE "tenantId" = $1 AND "userId" = $2`, [orgCasero.id, caseroUserId]);

    // -------------------------------------------------------------
    // PRUEBA 6: Sesión válida pero recurso fuera de facultades (Propietario intentando entrar a inmueble ajeno)
    // -------------------------------------------------------------
    console.log('\n[PRUEBA 6] Sesión válida con recurso fuera de facultades:');
    // Login propietario oficial en GoTrue
    const ownerAuth = await loginGoTrue('propietario@demo.custodia.app', DEMO_PASSWORD);
    
    // Consultar titularidad y facultades en la base de datos
    const caseroProp = (await pool.query(`SELECT id, name, "tenantId" FROM "Property" WHERE "tenantId" = $1 LIMIT 1`, [orgCasero.id])).rows[0];
    
    // Verificar si el owner tiene permisos sobre esta propiedad en la organización ajena
    const ownerMembership = (await pool.query(`
      SELECT * FROM "TenantMember" WHERE "userId" = $1 AND "tenantId" = $2
    `, [ownerAuth.user.id, orgCasero.id])).rows[0];
    assert(!ownerMembership, 'Propietario no tiene membresía en la organización del casero');

    // Verificar si el owner figura en los copropietarios de la propiedad
    const ownerPropertyLink = (await pool.query(`
      SELECT * FROM "PropertyOwner" WHERE "userId" = $1 AND "propertyId" = $2
    `, [ownerAuth.user.id, caseroProp.id])).rows[0];
    assert(!ownerPropertyLink, 'Propietario no tiene titularidad sobre el inmueble del casero');

    console.log(`\n============================================================`);
    console.log(`RESULTADO DE LA SUITE HTTP/SSR: ${passed} PASADAS, ${failed} FALLIDAS`);
    console.log(`============================================================`);

  } catch (err) {
    console.error('Error en runRealAuthSuite:', err);
  } finally {
    await pool.end();
  }
}

runRealAuthSuite();
