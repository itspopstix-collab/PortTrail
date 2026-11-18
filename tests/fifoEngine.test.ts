import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { DatabaseHelper } from '../src/database/DatabaseHelper.ts';
import type { RunResult, SQLiteDriver } from '../src/database/DatabaseHelper.ts';
import { FifoAccountingEngine } from '../src/services/FifoAccountingEngine.ts';

/**
 * In-memory SQLiteDriver adapter powered by Node's built-in `node:sqlite`
 * so we can test the exact SQLite schema and FIFO engine in Node.js.
 */
class NodeSQLiteDriver implements SQLiteDriver {
  private db: DatabaseSync;

  constructor() {
    this.db = new DatabaseSync(':memory:');
  }

  async execAsync(source: string): Promise<void> {
    this.db.exec(source);
  }

  async runAsync(source: string, ...params: unknown[]): Promise<RunResult> {
    const stmt = this.db.prepare(source);
    const result = stmt.run(...(params as (string | number | null)[]));
    return {
      lastInsertRowId: Number(result.lastInsertRowid),
      changes: Number(result.changes),
    };
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    const stmt = this.db.prepare(source);
    const row = stmt.get(...(params as (string | number | null)[]));
    return (row as T) ?? null;
  }

  async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(source);
    const rows = stmt.all(...(params as (string | number | null)[]));
    return rows as T[];
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.db.exec('BEGIN TRANSACTION');
    try {
      await task();
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

async function runTests(): Promise<void> {
  console.log('====================================================');
  console.log('🧪 Running Port Trail FIFO SQLite Engine Test Suite');
  console.log('====================================================\n');

  const driver = new NodeSQLiteDriver();
  const dbHelper = new DatabaseHelper(driver);
  await dbHelper.initialize();

  const portfolio = await dbHelper.ensureDefaultPortfolio();
  const engine = new FifoAccountingEngine(dbHelper);

  // ---------------------------------------------------------------------------
  // Step 1: Deposit $1,000 + $500 (Two distinct Capital Cash Lots)
  // ---------------------------------------------------------------------------
  const dep1 = await engine.deposit(portfolio.id, 1000, '2026-01-01T10:00:00.000Z');
  const dep2 = await engine.deposit(portfolio.id, 500, '2026-01-02T10:00:00.000Z');

  assert.equal(dep1.cashLot.original_amount, 1000);
  assert.equal(dep1.cashLot.is_realized, false, 'Deposit #1 should be Original Capital');
  assert.equal(dep2.cashLot.original_amount, 500);
  assert.equal(dep2.cashLot.is_realized, false, 'Deposit #2 should be Original Capital');
  console.log('✅ Step 1: Created two Deposit Cash Lots ($1,000 and $500 Capital).');

  // ---------------------------------------------------------------------------
  // Step 2: Buy 12 shares of AAPL @ $100 ($1,200 total)
  // Should fully consume Cash Lot #1 ($1,000) and take $200 from Cash Lot #2 ($300 left)
  // ---------------------------------------------------------------------------
  const buy1 = await engine.buyStock(
    portfolio.id,
    'AAPL',
    12,
    100,
    '2026-01-03T10:00:00.000Z'
  );

  assert.equal(buy1.consumedCashLots.length, 2, 'Should consume from 2 Cash Lots in FIFO');
  assert.equal(buy1.consumedCashLots[0].lotId, dep1.cashLot.id);
  assert.equal(buy1.consumedCashLots[0].consumedAmount, 1000);
  assert.equal(buy1.consumedCashLots[1].lotId, dep2.cashLot.id);
  assert.equal(buy1.consumedCashLots[1].consumedAmount, 200);
  assert.equal(buy1.capitalUsed, 1200);
  assert.equal(buy1.profitReinvested, 0);
  console.log('✅ Step 2: Bought 12 AAPL @ $100 ($1,200) via FIFO Cash Lot deduction.');

  // ---------------------------------------------------------------------------
  // Step 3: Sell 10 shares of AAPL @ $150 ($1,500 proceeds)
  // Cost basis of 10 shares = $1,000. Realized Profit = $500.
  // Should create 2 new Cash Lots:
  //   - Recovered Capital Cash Lot = $1,000 (is_realized = false)
  //   - Realized Profit Cash Lot   = $500   (is_realized = true)
  // ---------------------------------------------------------------------------
  const sell1 = await engine.sellStock(
    portfolio.id,
    'AAPL',
    10,
    150,
    '2026-01-04T10:00:00.000Z'
  );

  assert.equal(sell1.totalProceeds, 1500);
  assert.equal(sell1.totalCostBasis, 1000);
  assert.equal(sell1.realizedPnL, 500);
  assert.ok(sell1.recoveredCapitalLot, 'Must create Recovered Capital Cash Lot');
  assert.ok(sell1.realizedProfitLot, 'Must create Realized Profit Cash Lot');
  assert.equal(sell1.recoveredCapitalLot.original_amount, 1000);
  assert.equal(sell1.recoveredCapitalLot.is_realized, false);
  assert.equal(sell1.realizedProfitLot.original_amount, 500);
  assert.equal(sell1.realizedProfitLot.is_realized, true);
  console.log(
    '✅ Step 3: Sold 10 AAPL @ $150 -> Split into $1,000 Recovered Capital Lot + $500 Realized Profit Lot.'
  );

  // ---------------------------------------------------------------------------
  // Step 4: Check active Cash Lots queue before withdrawal:
  //   1. Cash Lot #2 (from Deposit #2): $300 remaining (Capital, 2026-01-02)
  //   2. Cash Lot #4 (Recovered Capital from AAPL sale): $1,000 (Capital, 2026-01-04)
  //   3. Cash Lot #5 (Realized Profit from AAPL sale): $500 (Profit, 2026-01-04)
  // Total Cash = $1,800 ($1,300 Capital + $500 Profit), plus 2 AAPL shares ($200 cost basis)
  // ---------------------------------------------------------------------------
  const metricsBeforeWithdraw = await engine.getDashboardMetrics(portfolio.id);
  assert.equal(metricsBeforeWithdraw.totalCashBalance, 1800);
  assert.equal(metricsBeforeWithdraw.capitalCashBalance, 1300);
  assert.equal(metricsBeforeWithdraw.profitCashBalance, 500);
  assert.equal(metricsBeforeWithdraw.investedStockCostBasis, 200);
  assert.equal(metricsBeforeWithdraw.totalPortfolioValue, 2000);
  assert.equal(metricsBeforeWithdraw.totalCapitalInjected, 1500);
  assert.equal(metricsBeforeWithdraw.netRealizedProfit, 500);
  console.log(
    '✅ Step 4: Verified Dashboard metrics (Total Value: $2,000 | Capital Injected: $1,500 | Net Realized Profit: $500).'
  );

  // ---------------------------------------------------------------------------
  // Step 5: Simulate Withdrawing $1,500 at 20% tax rate
  // FIFO order should pull:
  //   - $300 from Cash Lot #2 (Capital)
  //   - $1,000 from Cash Lot #4 (Recovered Capital)
  //   - $200 from Cash Lot #5 (Realized Profit)
  // Total from Capital = $1,300 (Tax-Free)
  // Total from Profit  = $200 (Taxable -> $40 estimated tax at 20%)
  // ---------------------------------------------------------------------------
  const sim = await engine.simulateWithdraw(portfolio.id, 1500, 20);
  assert.equal(sim.fromOriginalCapital, 1300);
  assert.equal(sim.fromRealizedProfit, 200);
  assert.equal(sim.estimatedTax, 40);
  assert.equal(sim.netAfterTax, 1460);
  console.log(
    '✅ Step 5: Simulated $1,500 withdrawal -> $1,300 from Capital (Tax-Free) + $200 from Profit ($40 est. tax).'
  );

  // ---------------------------------------------------------------------------
  // Step 6: Execute the $1,500 Withdrawal and verify remaining Cash Lot
  // ---------------------------------------------------------------------------
  const withdrawRes = await engine.withdraw(
    portfolio.id,
    1500,
    20,
    '2026-01-05T10:00:00.000Z'
  );
  assert.equal(withdrawRes.breakdown.fromOriginalCapital, 1300);
  assert.equal(withdrawRes.breakdown.fromRealizedProfit, 200);

  const metricsAfterWithdraw = await engine.getDashboardMetrics(portfolio.id);
  assert.equal(metricsAfterWithdraw.totalCashBalance, 300);
  assert.equal(metricsAfterWithdraw.capitalCashBalance, 0);
  assert.equal(metricsAfterWithdraw.profitCashBalance, 300);
  assert.equal(metricsAfterWithdraw.investedStockCostBasis, 200);
  assert.equal(metricsAfterWithdraw.netCapitalRemaining, 200); // 2 shares of AAPL @ $100
  assert.equal(metricsAfterWithdraw.netRealizedProfit, 500);
  console.log(
    '✅ Step 6: Executed $1,500 withdrawal -> Remaining Cash is $300 (100% Realized Profit) + $200 Capital in AAPL stock.'
  );

  console.log('\n🎉 All FIFO Accounting & SQLite tests passed!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

