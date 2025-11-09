/**
 * Abstract base class for SQL storage adapters.
 * 
 * Provides common functionality and enforces consistent behavior across all adapters.
 * Follows the Template Method pattern - subclasses implement adapter-specific logic
 * while the base class handles cross-cutting concerns.
 * 
 * ## Responsibilities
 * - Parameter validation and sanitization
 * - Error handling and standardization
 * - Lifecycle management (open/close state tracking)
 * - Performance monitoring
 * - Logging and diagnostics
 * 
 * @example Implementing a new adapter
 * ```typescript
 * export class MyAdapter extends BaseStorageAdapter {
 *   protected async doOpen(options?: StorageOpenOptions): Promise<void> {
 *     // Adapter-specific connection logic
 *   }
 * 
 *   protected async doRun(statement: string, parameters?: StorageParameters): Promise<StorageRunResult> {
 *     // Adapter-specific mutation logic
 *   }
 * 
 *   // ... implement other abstract methods
 * }
 * ```
 */

import type {
  StorageAdapter,
  StorageCapability,
  StorageOpenOptions,
  StorageParameters,
  StorageRunResult,
  BatchOperation,
  BatchResult,
  PreparedStatement
} from '../core/contracts';

/**
 * Base state for all adapters.
 */
enum AdapterState {
  CLOSED = 'closed',
  OPENING = 'opening',
  OPEN = 'open',
  CLOSING = 'closing',
  ERROR = 'error'
}

/**
 * Options for BaseStorageAdapter configuration.
 */
export interface BaseAdapterOptions {
  /** Enable detailed logging (default: false) */
  verbose?: boolean;
  /** Validate SQL statements before execution (default: true) */
  validateSQL?: boolean;
  /** Track performance metrics (default: true) */
  trackPerformance?: boolean;
  /** Max retry attempts for transient errors (default: 3) */
  maxRetries?: number;
}

/**
 * Performance metrics tracked by the base adapter.
 */
export interface AdapterMetrics {
  /** Total number of queries executed */
  totalQueries: number;
  /** Total number of mutations (INSERT/UPDATE/DELETE) */
  totalMutations: number;
  /** Total number of transactions */
  totalTransactions: number;
  /** Total number of errors */
  totalErrors: number;
  /** Average query duration in milliseconds */
  averageQueryDuration: number;
  /** Time when adapter was opened */
  openedAt: Date | null;
}

/**
 * Abstract base class for SQL storage adapters.
 * 
 * Implements common functionality shared by all adapters:
 * - State management (open/close tracking)
 * - Parameter validation
 * - Error handling and wrapping
 * - Performance metrics
 * - Logging and diagnostics
 */
export abstract class BaseStorageAdapter implements StorageAdapter {
  // Required interface properties (subclasses must set these)
  public abstract readonly kind: string;
  public abstract readonly capabilities: ReadonlySet<StorageCapability>;

  // State management
  private state: AdapterState = AdapterState.CLOSED;
  
  // Configuration
  protected readonly options: Required<BaseAdapterOptions>;
  
  // Metrics
  private metrics: AdapterMetrics = {
    totalQueries: 0,
    totalMutations: 0,
    totalTransactions: 0,
    totalErrors: 0,
    averageQueryDuration: 0,
    openedAt: null
  };
  
  // Performance tracking
  private queryDurations: number[] = [];
  private readonly MAX_DURATION_SAMPLES = 100; // Keep last 100 for rolling average

  /**
   * Creates a new adapter instance.
   * 
   * @param options - Configuration options for the adapter
   */
  constructor(options: BaseAdapterOptions = {}) {
    this.options = {
      verbose: options.verbose ?? false,
      validateSQL: options.validateSQL ?? true,
      trackPerformance: options.trackPerformance ?? true,
      maxRetries: options.maxRetries ?? 3
    };
  }

  // ============================================================================
  // Public Interface (Template Methods)
  // ============================================================================

  /**
   * Opens the adapter connection.
   * Handles state management and delegates to subclass implementation.
   */
  public async open(options?: StorageOpenOptions): Promise<void> {
    if (this.state === AdapterState.OPEN) {
      this.log('Adapter already open, skipping open()');
      return;
    }

    if (this.state === AdapterState.OPENING) {
      throw new Error(`[${this.kind}] Adapter is already opening`);
    }

    this.state = AdapterState.OPENING;
    
    try {
      await this.performOpen(options);
      this.state = AdapterState.OPEN;
      this.metrics.openedAt = new Date();
      this.log('Adapter opened successfully');
    } catch (error) {
      this.state = AdapterState.ERROR;
      this.metrics.totalErrors++;
      throw this.wrapError('Failed to open adapter', error);
    }
  }

  /**
   * Executes a mutation statement (INSERT, UPDATE, DELETE).
   */
  public async run(statement: string, parameters?: StorageParameters): Promise<StorageRunResult> {
    this.assertOpen();
    this.validateStatement(statement);
    
    const startTime = Date.now();
    
    try {
      const result = await this.performRun(statement, parameters);
      
      this.metrics.totalMutations++;
      this.trackDuration(Date.now() - startTime);
      
      this.log(`Mutation executed: ${statement.substring(0, 50)}... (${result.changes} rows affected)`);
      
      return result;
    } catch (error) {
      this.metrics.totalErrors++;
      throw this.wrapError(`Failed to execute mutation: ${statement}`, error);
    }
  }

  /**
   * Retrieves a single row.
   */
  public async get<T = unknown>(statement: string, parameters?: StorageParameters): Promise<T | null> {
    this.assertOpen();
    this.validateStatement(statement);
    
    const startTime = Date.now();
    
    try {
      const result = await this.performGet<T>(statement, parameters);
      
      this.metrics.totalQueries++;
      this.trackDuration(Date.now() - startTime);
      
      this.log(`Query executed: ${statement.substring(0, 50)}... (${result ? '1 row' : 'no rows'})`);
      
      return result;
    } catch (error) {
      this.metrics.totalErrors++;
      throw this.wrapError(`Failed to execute query: ${statement}`, error);
    }
  }

  /**
   * Retrieves all rows.
   */
  public async all<T = unknown>(statement: string, parameters?: StorageParameters): Promise<T[]> {
    this.assertOpen();
    this.validateStatement(statement);
    
    const startTime = Date.now();
    
    try {
      const results = await this.performAll<T>(statement, parameters);
      
      this.metrics.totalQueries++;
      this.trackDuration(Date.now() - startTime);
      
      this.log(`Query executed: ${statement.substring(0, 50)}... (${results.length} rows)`);
      
      return results;
    } catch (error) {
      this.metrics.totalErrors++;
      throw this.wrapError(`Failed to execute query: ${statement}`, error);
    }
  }

  /**
   * Executes a SQL script.
   */
  public async exec(script: string): Promise<void> {
    this.assertOpen();
    
    if (!script || !script.trim()) {
      throw new Error('SQL script cannot be empty');
    }
    
    const startTime = Date.now();
    
    try {
      await this.performExec(script);
      
      this.trackDuration(Date.now() - startTime);
      this.log(`Script executed successfully`);
    } catch (error) {
      this.metrics.totalErrors++;
      throw this.wrapError('Failed to execute script', error);
    }
  }

  /**
   * Executes a transaction.
   */
  public async transaction<T>(fn: (trx: StorageAdapter) => Promise<T>): Promise<T> {
    this.assertOpen();
    
    const startTime = Date.now();
    
    try {
      const result = await this.performTransaction(fn);
      
      this.metrics.totalTransactions++;
      this.trackDuration(Date.now() - startTime);
      this.log('Transaction committed successfully');
      
      return result;
    } catch (error) {
      this.metrics.totalErrors++;
      throw this.wrapError('Transaction failed', error);
    }
  }

  /**
   * Closes the adapter connection.
   */
  public async close(): Promise<void> {
    if (this.state === AdapterState.CLOSED) {
      this.log('Adapter already closed, skipping close()');
      return;
    }

    if (this.state === AdapterState.CLOSING) {
      throw new Error(`[${this.kind}] Adapter is already closing`);
    }

    this.state = AdapterState.CLOSING;
    
    try {
      await this.performClose();
      this.state = AdapterState.CLOSED;
      this.log('Adapter closed successfully');
    } catch (error) {
      this.state = AdapterState.ERROR;
      throw this.wrapError('Failed to close adapter', error);
    }
  }

  /**
   * Executes a batch of operations (optional).
   */
  public async batch(operations: BatchOperation[]): Promise<BatchResult> {
    this.assertOpen();
    
    if (!this.capabilities.has('batch')) {
      throw new Error(`[${this.kind}] Batch operations are not supported`);
    }
    
    if (!this.performBatch) {
      throw new Error(`[${this.kind}] Batch operations not implemented`);
    }
    
    if (!operations || operations.length === 0) {
      throw new Error('Batch operations cannot be empty');
    }
    
    const startTime = Date.now();
    
    try {
      const result = await this.performBatch(operations);
      
      this.trackDuration(Date.now() - startTime);
      this.log(`Batch executed: ${result.successful} successful, ${result.failed} failed`);
      
      return result;
    } catch (error) {
      this.metrics.totalErrors++;
      throw this.wrapError('Batch execution failed', error);
    }
  }

  /**
   * Creates a prepared statement (optional).
   */
  public prepare<T = unknown>(statement: string): PreparedStatement<T> {
    this.assertOpen();
    
    if (!this.capabilities.has('prepared')) {
      throw new Error(`[${this.kind}] Prepared statements are not supported`);
    }
    
    if (!this.performPrepare) {
      throw new Error(`[${this.kind}] Prepared statements not implemented`);
    }
    
    this.validateStatement(statement);
    return this.performPrepare<T>(statement);
  }

  // ============================================================================
  // Protected Abstract Methods (Subclasses MUST implement)
  // ============================================================================

  /**
   * Adapter-specific open logic.
   * Called by base class after state validation.
   */
  protected abstract performOpen(options?: StorageOpenOptions): Promise<void>;

  /**
   * Adapter-specific mutation logic.
   */
  protected abstract performRun(statement: string, parameters?: StorageParameters): Promise<StorageRunResult>;

  /**
   * Adapter-specific single-row query logic.
   */
  protected abstract performGet<T>(statement: string, parameters?: StorageParameters): Promise<T | null>;

  /**
   * Adapter-specific multi-row query logic.
   */
  protected abstract performAll<T>(statement: string, parameters?: StorageParameters): Promise<T[]>;

  /**
   * Adapter-specific script execution logic.
   */
  protected abstract performExec(script: string): Promise<void>;

  /**
   * Adapter-specific transaction logic.
   */
  protected abstract performTransaction<T>(fn: (trx: StorageAdapter) => Promise<T>): Promise<T>;

  /**
   * Adapter-specific close logic.
   */
  protected abstract performClose(): Promise<void>;

  /**
   * Adapter-specific batch logic (optional).
   * Only called if adapter declares 'batch' capability.
   */
  protected performBatch?(operations: BatchOperation[]): Promise<BatchResult>;

  /**
   * Adapter-specific prepared statement logic (optional).
   * Only called if adapter declares 'prepared' capability.
   */
  protected performPrepare?<T>(statement: string): PreparedStatement<T>;

  // ============================================================================
  // Protected Helper Methods (Available to subclasses)
  // ============================================================================

  /**
   * Asserts that adapter is in open state.
   * @throws {Error} If adapter is not open
   */
  protected assertOpen(): void {
    if (this.state !== AdapterState.OPEN) {
      throw new Error(`[${this.kind}] Adapter is not open (current state: ${this.state})`);
    }
  }

  /**
   * Validates SQL statement.
   * @throws {Error} If statement is invalid
   */
  protected validateStatement(statement: string): void {
    if (!this.options.validateSQL) {
      return;
    }

    if (!statement || !statement.trim()) {
      throw new Error('SQL statement cannot be empty');
    }

    // Basic SQL injection protection (parameters should be used instead)
    if (statement.includes('--') && !statement.includes('-- ')) {
      this.log('Warning: SQL comment detected in statement');
    }
  }

  /**
   * Wraps an error with adapter context.
   */
  protected wrapError(message: string, error: unknown): Error {
    const originalMessage = error instanceof Error ? error.message : String(error);
    const wrappedError = new Error(`[${this.kind}] ${message}: ${originalMessage}`);
    
    // Preserve stack trace
    if (error instanceof Error && error.stack) {
      wrappedError.stack = error.stack;
    }
    
    return wrappedError;
  }

  /**
   * Logs a message if verbose mode is enabled.
   */
  protected log(message: string): void {
    if (this.options.verbose) {
      console.log(`[${this.kind}] ${message}`);
    }
  }

  /**
   * Tracks query duration for performance metrics.
   */
  private trackDuration(duration: number): void {
    if (!this.options.trackPerformance) {
      return;
    }

    this.queryDurations.push(duration);
    
    // Keep only last N samples
    if (this.queryDurations.length > this.MAX_DURATION_SAMPLES) {
      this.queryDurations.shift();
    }
    
    // Update average
    const sum = this.queryDurations.reduce((a, b) => a + b, 0);
    this.metrics.averageQueryDuration = sum / this.queryDurations.length;
  }

  // ============================================================================
  // Public Utility Methods
  // ============================================================================

  /**
   * Gets current adapter state.
   */
  public getState(): string {
    return this.state;
  }

  /**
   * Gets performance metrics.
   */
  public getMetrics(): Readonly<AdapterMetrics> {
    return { ...this.metrics };
  }

  /**
   * Checks if adapter is open.
   */
  public isOpen(): boolean {
    return this.state === AdapterState.OPEN;
  }

  /**
   * Checks if adapter is closed.
   */
  public isClosed(): boolean {
    return this.state === AdapterState.CLOSED;
  }

  /**
   * Gets uptime in milliseconds.
   */
  public getUptime(): number {
    if (!this.metrics.openedAt) {
      return 0;
    }
    return Date.now() - this.metrics.openedAt.getTime();
  }
}
