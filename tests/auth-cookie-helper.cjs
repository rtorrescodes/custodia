require('dotenv').config();
const https = require('https');
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'DemoCustodia2026!';
const SUPABASE_HOST = 'ptfejkjyxrcmxslpuexo.supabase.co';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function login(email, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        const data = JSON.stringify({ email, password: DEMO_PASSWORD });
        const req = https.request({
          hostname: SUPABASE_HOST,
          path: '/auth/v1/token?grant_type=password',
          method: 'POST',
          headers: {
            'apikey': ANON_KEY,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
          },
          timeout: 10000
        }, res => {
          let body = '';
          res.on('data', d => body += d);
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              reject(err);
            }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy(new Error('Request timed out'));
        });
        req.write(data);
        req.end();
      });
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

async function getCookies(email) {
  const auth = await login(email);
  if (!auth.access_token) {
    throw new Error('Login failed: ' + JSON.stringify(auth));
  }
  const projectRef = 'ptfejkjyxrcmxslpuexo';
  const cookieName = 'sb-' + projectRef + '-auth-token';
  const payloadObj = {
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: auth.user
  };
  const b64 = 'base64-' + Buffer.from(JSON.stringify(payloadObj)).toString('base64');
  return {
    name: cookieName,
    value: b64,
    domain: 'localhost',
    path: '/'
  };
}

module.exports = { getCookies };

if (require.main === module) {
  getCookies(process.argv[2] || 'pm@demo.custodia.app')
    .then(c => console.log(JSON.stringify(c)))
    .catch(console.error);
}
