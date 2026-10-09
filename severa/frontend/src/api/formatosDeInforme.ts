// Formatos del informe completo de 20 secciones — los mismos para el informe
// de vulnerabilidades (/informes/completo) y el de un dataset genérico
// (/analisis-datos/:sesionId/informe). Contrato verificado contra
// FORMATOS_DE_INFORME en GeneradorDeInformes.ts (backend).
export const FORMATOS_DE_INFORME = [
  { valor: 'pdf', etiqueta: 'PDF' },
  { valor: 'docx', etiqueta: 'Word (.docx)' },
  { valor: 'html', etiqueta: 'Página web (.html)' },
  { valor: 'latex', etiqueta: 'LaTeX (.tex + figuras)' },
  { valor: 'xlsx', etiqueta: 'Excel: solo las tablas (.xlsx)' }
] as const;

export type FormatoInforme = (typeof FORMATOS_DE_INFORME)[number]['valor'];

export interface OpcionesDescargaDeInforme {
  formato: FormatoInforme;
  // RF-80: además del informe, cada gráfico como archivo suelto (PNG y SVG).
  adjuntarGraficos: boolean;
}

// Parámetros de consulta tal como los espera el backend. adjuntarGraficos
// solo viaja cuando es true: el valor por defecto del backend es false.
export function parametrosDeInforme(opciones: OpcionesDescargaDeInforme): Record<string, string> {
  return opciones.adjuntarGraficos ? { formato: opciones.formato, adjuntarGraficos: 'true' } : { formato: opciones.formato };
}

const EXTENSION_POR_TIPO_MIME: Array<[fragmento: string, extension: string]> = [
  ['application/zip', 'zip'],
  ['application/pdf', 'pdf'],
  ['wordprocessingml', 'docx'],
  ['spreadsheetml', 'xlsx'],
  ['text/html', 'html']
];

// El archivo que llega no siempre es del formato pedido: LaTeX y "con
// gráficos" se entregan en un .zip. La extensión se toma de lo que el
// servidor dice haber mandado (el tipo del Blob), no de lo que se pidió —
// un .zip guardado como "informe.pdf" no abre. Si el tipo no dice nada útil,
// se cae a deducirlo del pedido.
export function nombreDeArchivoDeInforme(base: string, blob: Blob, opciones: OpcionesDescargaDeInforme): string {
  const porTipo = EXTENSION_POR_TIPO_MIME.find(([fragmento]) => blob.type.includes(fragmento))?.[1];
  const porPedido = opciones.formato === 'latex' || opciones.adjuntarGraficos ? 'zip' : opciones.formato;
  return `${base}.${porTipo ?? porPedido}`;
}
