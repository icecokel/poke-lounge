export interface PreparationAcknowledgementPorts<Snapshot> {
  isNeeded(): boolean;
  submit(): Promise<Snapshot>;
  apply(snapshot: Snapshot): void;
  isRevisionConflict(error: unknown): boolean;
}
export async function acknowledgePreparation<Snapshot>(
  ports: PreparationAcknowledgementPorts<Snapshot>,
): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (!ports.isNeeded()) return;
    try {
      ports.apply(await ports.submit());
      return;
    } catch (error) {
      if (!ports.isRevisionConflict(error) || attempt === 7) throw error;
    }
  }
}
