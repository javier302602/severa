export interface GraficosOutputPort {
  renderizarHistograma(datos: unknown, formato: 'svg' | 'json' | 'png' | 'pdf', titulo?: string, etiquetaEjeX?: string): Promise<unknown>;
  renderizarBarras(
    datos: unknown,
    formato: 'svg' | 'json' | 'png' | 'pdf',
    titulo?: string,
    etiquetaEjeY?: string,
    etiquetaEjeX?: string,
    // RF-28 / RF-69 + RF-61: una línea escrita dentro del propio gráfico (por
    // ejemplo, la escala de niveles de riesgo), para que la lleve también el
    // PNG o el PDF que sale de la aplicación.
    nota?: string
  ): Promise<unknown>;
  renderizarPastel(datos: unknown, formato: 'svg' | 'json' | 'png' | 'pdf', titulo?: string, nota?: string): Promise<unknown>;
  renderizarBoxplot(datos: unknown, formato: 'svg' | 'json' | 'png' | 'pdf', titulo?: string): Promise<unknown>;
  renderizarDispersion(datos: unknown, formato: 'svg' | 'json' | 'png' | 'pdf', titulo?: string): Promise<unknown>;
  renderizarBarrasHorizontales(datos: unknown, formato: 'svg' | 'json' | 'png' | 'pdf', titulo?: string, etiquetaEjeX?: string): Promise<unknown>;
}
