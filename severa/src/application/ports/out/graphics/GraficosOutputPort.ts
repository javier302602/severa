export interface GraficosOutputPort {
  renderizarHistograma(datos: unknown, formato: 'svg' | 'json' | 'png' | 'pdf', titulo?: string, etiquetaEjeX?: string): Promise<unknown>;
  renderizarBarras(
    datos: unknown,
    formato: 'svg' | 'json' | 'png' | 'pdf',
    titulo?: string,
    etiquetaEjeY?: string,
    etiquetaEjeX?: string
  ): Promise<unknown>;
  renderizarPastel(datos: unknown, formato: 'svg' | 'json' | 'png' | 'pdf', titulo?: string): Promise<unknown>;
  renderizarBoxplot(datos: unknown, formato: 'svg' | 'json' | 'png' | 'pdf', titulo?: string): Promise<unknown>;
  renderizarDispersion(datos: unknown, formato: 'svg' | 'json' | 'png' | 'pdf', titulo?: string): Promise<unknown>;
  renderizarBarrasHorizontales(datos: unknown, formato: 'svg' | 'json' | 'png' | 'pdf', titulo?: string, etiquetaEjeX?: string): Promise<unknown>;
}
