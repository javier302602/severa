export interface GenerarInformeUseCase {
  ejecutar(formato: 'pdf' | 'docx'): Promise<Buffer>;
}
