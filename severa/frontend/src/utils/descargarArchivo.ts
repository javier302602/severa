// Dispara la descarga de un blob/texto en el navegador sin depender de que el
// backend mande Content-Disposition (InformeController/BusquedaController no
// lo hacen — solo setean Content-Type) — el nombre de archivo lo decide el
// frontend.
export function descargarArchivo(contenido: Blob | string, nombreArchivo: string, tipoMime?: string): void {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
