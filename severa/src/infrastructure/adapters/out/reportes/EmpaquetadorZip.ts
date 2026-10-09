import JSZip from 'jszip';

// Un .zip con varios archivos, para las exportaciones que no caben en uno
// solo: el informe en LaTeX con sus figuras (RF-133) y cualquier informe con
// sus gráficos como archivos independientes (RF-80).
export interface ArchivoEmpaquetado {
  ruta: string;
  contenido: Buffer | string;
}

// Fecha fija en las entradas: sin esto cada zip lleva la hora de generación
// en su cabecera y dos exportaciones del mismo informe nunca son iguales
// byte a byte, lo que impide compararlas.
const FECHA_DE_ENTRADA = new Date(Date.UTC(2020, 0, 1));

export function empaquetarZip(archivos: ArchivoEmpaquetado[]): Promise<Buffer> {
  const zip = new JSZip();
  archivos.forEach((archivo) => zip.file(archivo.ruta, archivo.contenido, { date: FECHA_DE_ENTRADA }));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

// Nombre de archivo seguro a partir de un texto libre (el título de un
// gráfico puede traer el nombre de una columna del usuario): sin
// separadores de ruta ni caracteres que Windows rechaza, sin acentos, y
// acotado en largo.
export function nombreDeArchivoSeguro(texto: string): string {
  const base = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60)
    .replace(/-+$/g, '');
  return base === '' ? 'sin-titulo' : base;
}
