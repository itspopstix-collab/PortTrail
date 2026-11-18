import {
  DATABASE_NAME,
  INITIAL_SCHEMA_SCRIPTS,
} from './schema.ts';
import type { Portfolio, TaxLot, TaxLotRow } from '../types/models.ts';

export interface RunResult {
  lastInsertRowId: number;
  changes: number;
}

/**
 * Minimal database driver interface compatible with `expo-sqlite` (SQLiteDatabase)
 * as well as Node SQLite adapters for unit/integration testing.
 */
export interface SQLiteDriver {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: unknown[]): Promise<RunResult>;
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/**
 * Converts a raw SQLite `Tax_Lots` row (where `is_realized` is 0 or 1)
 * into a strongly-typed `TaxLot` domain model.
 */
export function mapTaxLotRow(row: TaxLotRow): TaxLot {
  return {
    ...row,
    is_realized: Boolean(row.is_realized),
  };
}

/**
 * Singleton-capable SQLite Database Helper class for Port Trail.
 * Manages database initialization, table creation, atomic transactions, and default portfolio seeding.
 */
export class DatabaseHelper {
  private static instance: DatabaseHelper | null = null;
  private driver: SQLiteDriver | null = null;

  constructor(customDriver?: SQLiteDriver) {
    if (customDriver) {
      this.driver = customDriver;
    }
  }

  /**
   * Returns the shared singleton DatabaseHelper instance for the mobile app.
   */
  public static async getInstance(): Promise<DatabaseHelper> {
    if (!DatabaseHelper.instance) {
      DatabaseHelper.instance = new DatabaseHelper();
      await DatabaseHelper.instance.initialize();
    }
    return DatabaseHelper.instance;
  }

  /**
   * Opens the local SQLite database (via `expo-sqlite` if no custom driver was injected),
   * creates `Portfolios`, `Transactions`, and `Tax_Lots` tables, and ensures a default portfolio exists.
   */
  public async initialize(): Promise<void> {
    if (!this.driver) {
      // Dynamically import expo-sqlite in the React Native runtime
      const SQLite = await import('expo-sqlite');
      this.driver = (await SQLite.openDatabaseAsync(DATABASE_NAME)) as unknown as SQLiteDriver;
    }

    for (const script of INITIAL_SCHEMA_SCRIPTS) {
      await this.driver.execAsync(script);
    }

    await this.ensureDefaultPortfolio();
  }

  /**
   * Returns the active SQLite driver or throws if uninitialized.
   */
  public getDriver(): SQLiteDriver {
    if (!this.driver) {
      throw new Error('DatabaseHelper has not been initialized. Call initialize() first.');
    }
    return this.driver;
  }

  /**
   * Executes a callback inside an atomic SQLite transaction.
   */
  public async withTransaction<T>(work: (driver: SQLiteDriver) => Promise<T>): Promise<T> {
    const driver = this.getDriver();
    let result!: T;
    await driver.withTransactionAsync(async () => {
      result = await work(driver);
    });
    return result;
  }

  /**
   * Ensures at least one Portfolio ("Main Broker", "USD") exists on first launch.
   */
  public async ensureDefaultPortfolio(): Promise<Portfolio> {
    const driver = this.getDriver();
    const existing = await driver.getFirstAsync<Portfolio>(
      'SELECT id, name, currency FROM Portfolios ORDER BY id ASC LIMIT 1'
    );
    if (existing) {
      return existing;
    }

    const insertResult = await driver.runAsync(
      'INSERT INTO Portfolios (name, currency) VALUES (?, ?)',
      'Main Broker',
      'USD'
    );

    return {
      id: insertResult.lastInsertRowId,
      name: 'Main Broker',
      currency: 'USD',
    };
  }
}

