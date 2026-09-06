export type FrecuenciaInformePeriodico = 'semanal' | 'mensual';

export interface ProgramarInformePeriodicoUseCase {
  ejecutar(frecuencia: FrecuenciaInformePeriodico, analistaId: string): Promise<void>;
}
