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
  const [adminRole, existingAdmin] = await Promise.all([
    prisma.role.findUnique({ where: { name: 'admin' }, select: { id: true } }),
    prisma.user.findFirst({
      where: { role: { name: { in: ['admin', 'sub_admin'] } } },
      orderBy: { id: 'asc' },
      select: { id: true },
    }),
  ]);

  if (!adminRole) {
    throw new Error('The admin role must exist before running this script');
  }

  const password = await bcrypt.hash(adminPassword, 12);
  const user = existingAdmin
    ? await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          phone: adminPhone,
          password,
          name: 'المدير العام',
          email: adminEmail,
          isActive: true,
          roleId: adminRole.id,
          approvalStatus: 'APPROVED',
          rejectionReason: null,
        },
        select: { id: true, phone: true, name: true, email: true, isActive: true, roleId: true },
      })
    : await prisma.user.create({
        data: {
          phone: adminPhone,
          password,
          name: 'المدير العام',
          email: adminEmail,
          isActive: true,
          roleId: adminRole.id,
          approvalStatus: 'APPROVED',
        },
        select: { id: true, phone: true, name: true, email: true, isActive: true, roleId: true },
      });

  await prisma.user.updateMany({
    where: {
      id: { not: user.id },
      role: { name: { in: ['admin', 'sub_admin'] } },
    },
    data: { isActive: false },
  });

  console.log(JSON.stringify({ status: 'ok', user }, null, 2));
}

main()
  .catch((error) => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
