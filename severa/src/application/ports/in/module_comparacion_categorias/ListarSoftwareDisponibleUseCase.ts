export interface ListarSoftwareDisponibleUseCase {
  ejecutar(analistaId: string): Promise<string[]>;
}
