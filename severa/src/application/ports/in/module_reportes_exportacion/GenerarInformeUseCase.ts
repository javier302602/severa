import { ArchivoGenerado, FormatoDeInforme, OpcionesDeInforme } from '../../out/reportes/GeneradorDeInformes';

export interface GenerarInformeUseCase {
  // analistaId: quién lo pidió (siempre del token) — se usa para resolver el
  // nombre que aparece en la portada del informe (ver
  // ResolverNombreAnalistaParaInforme.ts), no solo para auditoría.
  //
  // Devuelve ArchivoGenerado y no un Buffer a secas: el archivo que resulta
  // no siempre es del formato pedido (LaTeX y "con gráficos" se entregan en
  // un .zip), y quien lo sirve necesita saber tipo y extensión reales.
  ejecutar(formato: FormatoDeInforme, analistaId: string, opciones?: OpcionesDeInforme): Promise<ArchivoGenerado>;
}
