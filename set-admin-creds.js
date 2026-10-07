require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const adminPhone = String(process.env.ADMIN_PHONE || '').trim();
const adminPassword = String(process.env.ADMIN_PASSWORD || '');
const adminEmail = String(process.env.ADMIN_EMAIL || '').trim() || null;

if (!adminPhone || !adminPassword) {
  throw new Error('ADMIN_PHONE and ADMIN_PASSWORD environment variables are required');
}

async function main() {
  const [adminRole, customerRole] = await Promise.all([
    prisma.role.findUnique({ where: { name: 'admin' }, select: { id: true } }),
    prisma.role.findUnique({ where: { name: 'customer' }, select: { id: true } }),
  ]);

  if (!adminRole || !customerRole) {
    throw new Error('The admin and customer roles must exist before running this script');
  }

  await prisma.user.updateMany({
    where: { role: { name: { in: ['admin', 'sub_admin'] } } },
    data: { isActive: false, roleId: customerRole.id },
  });

  const password = await bcrypt.hash(adminPassword, 12);
  const user = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {
      name: 'المدير العام',
      email: adminEmail,
      password,
      roleId: adminRole.id,
      isActive: true,
      approvalStatus: 'APPROVED',
      rejectionReason: null,
    },
    create: {
      phone: adminPhone,
      name: 'المدير العام',
      email: adminEmail,
      password,
      roleId: adminRole.id,
      isActive: true,
      approvalStatus: 'APPROVED',
    },
    select: { id: true, phone: true, name: true, email: true, isActive: true, roleId: true },
  });

  console.log(JSON.stringify({ status: 'ok', user }, null, 2));
}

main()
  .catch((error) => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
