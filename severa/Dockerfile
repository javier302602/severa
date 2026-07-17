# node:20-alpine NO sirve aquí: dependency-cruiser@18.0.0 (devDependency,
# corrido por "npm run build" vía lint:deps) exige Node ^22||^24||>=26 — el
# proyecto no declara ningún "engines" en package.json, así que esta
# incompatibilidad nunca se hizo visible hasta construir la imagen con Node 20
# real (en local todo compiló bien porque la máquina de desarrollo corre
# Node 24). Se usa 22-alpine (LTS activo) en vez de forzar 20.
#
# ---- Etapa de build: compila TypeScript, incluye devDependencies ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json .dependency-cruiser.js ./
COPY src ./src
# "npm run build" corre depcruise --validate antes de tsc (ver package.json);
# si el árbol de dependencias tuviera una violación, la imagen ni se construye.
RUN npm run build

# ---- Etapa final: solo dist/ + node_modules de producción ----
# Mismo Node que la etapa de build, por consistencia (ver comentario arriba).
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
# scripts/migrate.js es JS plano a propósito (ver comentario en el propio
# archivo): corre con las dependencias de producción, sin necesitar
# ts-node/typescript en esta imagen.
COPY scripts ./scripts
# Los .sql no pasan por tsc (solo compila .ts a dist/), así que se copian
# aparte para que migrate.js los encuentre en el mismo path relativo que usa
# en desarrollo.
COPY src/infrastructure/adapters/out/persistence/migrations ./src/infrastructure/adapters/out/persistence/migrations

# Documenta el puerto por defecto de config.port (env.ts: PORT ?? 3000). Si
# se cambia PORT en tiempo de ejecución, EXPOSE no lo sigue (es metadata fija
# de build) — hay que publicar el puerto real en docker-compose.yml/`docker run -p`.
EXPOSE 3000

CMD ["node", "dist/infrastructure/config/server.js"]
