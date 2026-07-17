#!/usr/bin/env node
'use strict';

// Runner de migraciones deliberadamente en JS plano (no TS): la imagen Docker
// final NO incluye devDependencies (ts-node, typescript), pero SÍ incluye
// `pg` y `dotenv` (dependencias de producción). Si este script hubiera sido
// .ts, "npm run migrate" habría fallado en el contenedor final a menos que
// se instalara ts-node solo para esto. Por el mismo motivo lee
// process.env.DATABASE_URL directamente en vez de importar
// src/infrastructure/config/env.ts (que vive bajo "rootDir": "src" del
// tsconfig y está pensado para compilarse con el resto de la app, no para
// ejecutarse suelto).
//
// Idempotencia: se eligió una tabla de control (`schema_migrations`) en vez
// de depender solo de `CREATE TABLE IF NOT EXISTS` dentro de cada archivo.
// IF NOT EXISTS alcanza para las migraciones actuales (todas son CREATE
// TABLE), pero no sirve en general para migraciones futuras que no sean
// creaciones de tabla (ALTER TABLE, backfills de datos, DROP COLUMN) — esas
// no se pueden re-ejecutar a ciegas sin duplicar efectos. La tabla de
// control deja, además, un registro auditable de cuándo se aplicó cada
// migración, consistente con la disciplina de auditoría del resto del
// proyecto (RF-94/95).
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(
  __dirname,
  '..',
  'src',
  'infrastructure',
  'adapters',
  'out',
  'persistence',
  'migrations'
);

async function migrar() {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/severa_dev';
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        nombre_archivo TEXT PRIMARY KEY,
        aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const archivos = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((archivo) => archivo.endsWith('.sql'))
      .sort(); // el prefijo numérico (001_, 002_, ...) garantiza el orden de dependencia

    const { rows: aplicadas } = await pool.query('SELECT nombre_archivo FROM schema_migrations');
    const yaAplicadas = new Set(aplicadas.map((fila) => fila.nombre_archivo));

    let pendientes = 0;

    for (const archivo of archivos) {
      if (yaAplicadas.has(archivo)) {
        console.log(`[migrate] ${archivo} ya aplicada, se omite`);
        continue;
      }

      pendientes += 1;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), 'utf-8');
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (nombre_archivo) VALUES ($1)', [archivo]);
        await client.query('COMMIT');
        console.log(`[migrate] ${archivo} aplicada`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Falló la migración ${archivo}: ${error.message}`);
      } finally {
        client.release();
      }
    }

    console.log(
      pendientes > 0
        ? `[migrate] Listo: ${pendientes} migración(es) nueva(s) aplicada(s).`
        : '[migrate] Todas las migraciones ya estaban al día.'
    );
  } finally {
    await pool.end();
  }
}

migrar().catch((error) => {
  console.error('[migrate] Error:', error.message);
  process.exit(1);
});
