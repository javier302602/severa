import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  databaseUrl: string;
  jwtSecret: string;
  nvdApiKey: string;
  nvdApiBaseUrl: string;
  port: number;
  nodeEnv: string;
  corsOrigin: string;
}

export const config: AppConfig = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/severa_dev',
  jwtSecret: process.env.JWT_SECRET ?? 'change_me',
  nvdApiKey: process.env.NVD_API_KEY ?? '',
  nvdApiBaseUrl: process.env.NVD_API_BASE_URL ?? 'https://api.nvd.nist.gov',
  port: Number(process.env.PORT ?? '3000'),
  // RF-93: solo en 'development' se permite HTTP sin cifrar (ver HttpsMiddleware.ts).
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // Origen del frontend (Vite): sin esto, cualquier navegador bloquea las
  // peticiones del SPA por CORS antes de que lleguen a Express — hueco
  // encontrado al conectar el frontend real (Sprint 15). Default al puerto
  // por defecto de `vite dev`.
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173'
};
