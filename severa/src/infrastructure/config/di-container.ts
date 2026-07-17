import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  databaseUrl: string;
  jwtSecret: string;
  nvdApiKey: string;
  nvdApiBaseUrl: string;
  port: number;
}

export const config: AppConfig = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/severa_dev',
  jwtSecret: process.env.JWT_SECRET ?? 'change_me',
  nvdApiKey: process.env.NVD_API_KEY ?? '',
  nvdApiBaseUrl: process.env.NVD_API_BASE_URL ?? 'https://api.nvd.nist.gov',
  port: Number(process.env.PORT ?? '3000')
};

export function initializeDependencies(): void {
  // Aquí se conectarán los puertos con sus adaptadores cuando estén disponibles.
}
