# SEVERA

Sistema de Priorización de Vulnerabilidades de Software.

## Instalación (desarrollo local, sin Docker)

1. Copia `.env.example` a `.env` y completa las variables (`JWT_SECRET` real,
   `NVD_API_KEY` si vas a sincronizar con la API de NVD).
2. Arranca solo PostgreSQL en Docker (la app corre en el host con `npm run dev`):

```bash
docker compose up -d postgres
```

3. Instala dependencias y aplica las migraciones:

```bash
npm install
npm run migrate
```

4. Arranca la app:

```bash
npm run dev
```

## Despliegue con Docker Compose (app + PostgreSQL completos)

Para levantar TODO el stack containerizado (la app compilada + PostgreSQL),
sin instalar Node localmente:

1. Clona el repo y entra a `severa/`.
2. Copia `.env.example` a `.env`. **Reemplazá `JWT_SECRET`** por uno propio
   (el del ejemplo es público, ver comentario en `.env.example`) antes de
   cualquier despliegue que no sea una prueba descartable.
3. Levanta todo:

```bash
docker compose up --build
```

Esto construye la imagen de la app (`Dockerfile`, multi-stage: compila
TypeScript en una etapa, la imagen final solo tiene `dist/` + dependencias de
producción), espera a que PostgreSQL esté realmente listo (`healthcheck` con
`pg_isready`, no solo "el contenedor arrancó"), corre `npm run migrate`
automáticamente contra la base y recién ahí arranca el servidor
(`docker-compose.yml`, servicio `app`, `command`).

Vas a ver en los logs algo como:

```
severa_app  | [migrate] 001_create_analistas_table.sql aplicada
severa_app  | ...
severa_app  | [migrate] Listo: 5 migración(es) nueva(s) aplicada(s).
severa_app  | SEVERA running on http://localhost:3000
```

Volver a correr `docker compose up --build` (o reiniciar el contenedor `app`)
no vuelve a aplicar las migraciones ya aplicadas — `npm run migrate` es
idempotente (ver "Migraciones" abajo); vas a ver `ya aplicada, se omite` en su
lugar.

Probar que responde:

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/auth/register -H "Content-Type: application/json" \
  -d '{"id":"analista-1","nombre":"Ana","correo":"ana@example.com","contrasena":"ClaveSegura123","rol":"analista"}'
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"correo":"ana@example.com","contrasena":"ClaveSegura123"}'
```

Para bajar todo (conservando los datos en el volumen `severa_postgres_data`):

```bash
docker compose down
```

Para bajar todo Y borrar los datos:

```bash
docker compose down -v
```

## Migraciones

Los `.sql` en `src/infrastructure/adapters/out/persistence/migrations/` están
numerados (`001_...`, `002_...`, ...) en el orden real de dependencia (p. ej.
`001_create_analistas_table.sql` va antes que `004_create_filtros_favoritos_table.sql`
porque esta última tiene una FK a `analistas`).

`scripts/migrate.js` las aplica en ese orden contra `DATABASE_URL`. Es
idempotente vía una tabla de control `schema_migrations` (no solo por los
`CREATE TABLE IF NOT EXISTS` de cada archivo — ver comentario en el propio
script para el porqué). Para correrlas a mano (por ejemplo, contra una base
que no pasó por Docker Compose):

```bash
npm run migrate
```

## Scripts

- `npm run dev` - inicia la aplicación en modo desarrollo (`ts-node-dev`)
- `npm run build` - compila TypeScript a `dist`
- `npm start` - corre la app ya compilada (`node dist/...`) — lo que usa la imagen Docker
- `npm run migrate` - aplica las migraciones pendientes contra `DATABASE_URL`
- `npm test` - ejecuta todos los tests
- `npm run test:domain` - ejecuta solo los tests del dominio

## Respaldo automático (RF-96)

`scripts/backup.sh` corre `pg_dump` contra `DATABASE_URL` y guarda el respaldo
en `./backups` (configurable con `BACKUP_DIR`). Requiere `pg_dump` instalado
localmente (mismo cliente que trae `postgresql-client`).

```bash
./scripts/backup.sh
```

El script en sí **no se programa solo** — no hay cron ni scheduler dentro de
la aplicación todavía. Para que el respaldo sea diario, prográmalo con el
mecanismo del sistema operativo donde corra SEVERA:

**Linux (cron)** — edita `crontab -e` y agrega, por ejemplo, para las 2 AM:

```
0 2 * * * cd /ruta/a/severa && ./scripts/backup.sh >> /var/log/severa-backup.log 2>&1
```

**Windows (Task Scheduler)** — crea una tarea con `schtasks`:

```powershell
schtasks /create /tn "SeveraBackup" /tr "C:\ruta\a\severa\scripts\backup.sh" /sc daily /st 02:00
```

(requiere Git Bash o WSL disponible en el PATH para ejecutar el `.sh`).

Para restaurar un respaldo:

```bash
pg_restore --clean --if-exists -d $DATABASE_URL backups/severa_<timestamp>.dump
```

## Autenticación y roles (RF-91, RF-93)

Todas las rutas excepto `POST /auth/register` y `POST /auth/login` requieren
un header `Authorization: Bearer <token>` con el JWT devuelto por el login.
Las rutas administrativas (por ejemplo `GET /auditoria`) además requieren que
el rol del token sea `administrador`.

Fuera de `NODE_ENV=development`, todas las rutas exigen HTTPS (ver
`HttpsMiddleware.ts`). **El `docker-compose.yml` de este repo es un despliegue
básico sin terminación TLS** (no incluye nginx/Traefik ni ningún proxy
delante de la app) — por eso `.env`/`.env.example` mantienen
`NODE_ENV=development` para que el stack responda por HTTP plano tal como
está. Un despliegue de producción real necesita un proxy reverso que termine
TLS y mande `X-Forwarded-Proto: https`, y recién ahí `NODE_ENV=production`
(si no, `exigirHttps` va a devolver 403 a todo). Esto queda pendiente,
reportado como hueco, no resuelto en silencio.
