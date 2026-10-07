const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const candidates = await prisma.$queryRawUnsafe(`
    SELECT u.id, u.phone, u.name, r.name AS role_name
    FROM users u
    JOIN roles r ON r.id = u."roleId"
    WHERE r.name = 'sub_admin'
    ORDER BY u.id ASC
  `);

  console.log(JSON.stringify({ before: candidates }, null, 2));

  const result = await prisma.$queryRawUnsafe(`
    DELETE FROM users
    WHERE "roleId" = (SELECT id FROM roles WHERE name = 'sub_admin')
  `);

  const remaining = await prisma.$queryRawUnsafe(`
    SELECT u.id, u.phone, u.name, r.name AS role_name
    FROM users u
    JOIN roles r ON r.id = u."roleId"
    WHERE r.name = 'sub_admin'
    ORDER BY u.id ASC
  `);

  console.log(JSON.stringify({ deletedRows: result, remainingSubAdmins: remaining }, null, 2));
}

main()
  .catch((error) => {
    console.error('ERROR:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
