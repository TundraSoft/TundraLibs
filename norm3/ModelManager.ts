export class ModelManager {
  public static init(): void {} // Load the models
  public static verify(): void {} // Verify the models

  public static registerModel(): void {} // Register a model
  public static get(): void {} // Get the model

  public static generateDDL(): void {} // Generate the DDL for the models
  public static generateMigration(): void {} // Generate the migration for the models

  // Event listenrs
  public static on(): void {} // Register an event listener
  public static off(): void {} // Remove an event listener
  protected static emit(): void {} // Emit an event
}
