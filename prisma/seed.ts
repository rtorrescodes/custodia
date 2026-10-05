import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

async function main() {
  console.log('Seeding database...');

  // 1. Create Supabase Auth User
  const email = 'rodrigo@zirian.com';
  const password = 'Sistema10$';

  let authUser;
  
  const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
  const found = existingUser.users.find(u => u.email === email);

  if (found) {
    console.log('User already exists in Supabase Auth, updating password...');
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(found.id, { password });
    if (error) throw error;
    authUser = data.user;
  } else {
    console.log('Creating new user in Supabase Auth...');
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    authUser = data.user;
  }

  if (!authUser) throw new Error('Failed to create/get Supabase Auth User');

  // 2. Create Tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Zirian Property Management',
      countryCode: 'MX',
      currency: 'MXN',
      timezone: 'America/Mexico_City',
    },
  });
  console.log(`Created Tenant: ${tenant.name} (${tenant.id})`);

  // 3. Create Prisma User linked to Auth User
  // First check if exists to avoid unique constraint errors
  const dbUser = await prisma.user.upsert({
    where: { id: authUser.id },
    update: { tenantId: tenant.id },
    create: {
      id: authUser.id,
      tenantId: tenant.id,
      email: authUser.email!,
      passwordHash: 'handled_by_supabase', // Not needed since Supabase handles auth
      role: 'SUPER_ADMIN',
    },
  });
  console.log(`Created DB User: ${dbUser.email}`);

  // 4. Update Supabase app_metadata with tenantId
  await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
    app_metadata: {
      tenantId: tenant.id,
      role: 'SUPER_ADMIN'
    }
  });

  // 5. Create Properties
  const prop1 = await prisma.property.create({
    data: {
      tenantId: tenant.id,
      name: 'Torre Marena PH2',
      address: 'Blvd. Kukulcan Km 10, Cancun',
    }
  });

  const prop2 = await prisma.property.create({
    data: {
      tenantId: tenant.id,
      name: 'Residencial Aurora 4B',
      address: 'Av. Las Torres 123, Monterrey',
    }
  });

  console.log('Created Properties');

  // 6. Create Work Orders
  await prisma.workOrder.create({
    data: {
      tenantId: tenant.id,
      propertyId: prop1.id,
      title: 'Inspección estructural',
      description: 'Revisión periódica de pilares principales.',
      status: 'PENDING',
    }
  });

  await prisma.workOrder.create({
    data: {
      tenantId: tenant.id,
      propertyId: prop2.id,
      title: 'Cambio de luminarias',
      description: 'Sustitución de luces LED en pasillos.',
      status: 'IN_PROGRESS',
    }
  });

  // 7. Create Transactions
  await prisma.transaction.create({
    data: {
      tenantId: tenant.id,
      propertyId: prop1.id,
      amount: 15000.00,
      currency: 'MXN',
      type: 'INCOME',
      category: 'Mantenimiento',
      description: 'Cuota de mantenimiento mensual',
    }
  });

  await prisma.transaction.create({
    data: {
      tenantId: tenant.id,
      propertyId: prop2.id,
      amount: 4500.00,
      currency: 'MXN',
      type: 'EXPENSE',
      category: 'Reparaciones',
      description: 'Pago a electricista por luminarias',
    }
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
