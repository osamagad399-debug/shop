const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: { role: true },
    orderBy: { id: 'asc' },
  });

  console.log(JSON.stringify(users.map((u) => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    isActive: u.isActive,
    role: u.role?.name,
  })), null, 2));
}

main().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
