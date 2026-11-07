// Prueba de conexión a PostgreSQL (Supabase)
// Uso: node test-connection.js
//
// Requisitos:
//   npm install pg

const { Client } = require('pg');

// La URL se lee del .env (copiada) o se usa la por defecto:
const conn = process.env.DATABASE_URL || 'postgresql://postgres.ibvjpvdijzcxzfzreerv:Intybolbia2026@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

async function main() {
  const client = new Client({
    connectionString: conn,
  });

  try {
    console.log('Conectando a:', conn);
    await client.connect();
    console.log('✅ Conexión exitosa a PostgreSQL');

    const res = await client.query(
      'SELECT current_database() AS db, current_user AS user, version() AS version'
    );
    console.log('  DB:', res.rows[0].db);
    console.log('  User:', res.rows[0].user);
    console.log('  Version:', res.rows[0].version);

    await client.end();
    console.log('✅ Sesión cerrada correctamente');
  } catch (err) {
    console.error('❌ Error de conexión:', err.message);
    process.exit(1);
  }
}

main();
