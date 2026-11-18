import { DatabaseHelper, mapTaxLotRow } from '../database/DatabaseHelper.ts';
import type { SQLiteDriver } from '../database/DatabaseHelper.ts';
import {
  ActionType,
  AssetType,
  type BuyExecutionResult,
  type ConsumedLotDetail,
  type DashboardMetrics,
  type Portfolio,
  type SellExecutionResult,
  type StockHoldingSummary,
  type TaxLot,
  type TaxLotRow,
  type Transaction,
  type WithdrawBreakdown,
} from '../types/models.ts';

const EPSILON = 1e-6;

function roundAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e6) / 1e6;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/**
 * Core FIFO Lot-Matching & Tax Accounting Engine for Port Trail.
 *
 * Implements the 4 core actions:
 * 1. Deposit  -> Creates an Original Capital Cash Lot (`is_realized = 0`)
 * 2. Buy      -> Deducts from oldest Cash Lots (FIFO) & creates Stock Lot(s)
 * 3. Sell     -> Deducts from oldest Stock Lots (FIFO), calculates Realized P&L,
 *                and creates two new Cash Lots:
 *                - Recovered Original Capital (`is_realized = 0`)
 *                - Realized Profit (`is_realized = 1`)
 * 4. Withdraw -> Deducts from oldest Cash Lots (FIFO) and identifies how much
 *                comes from Original Capital vs. Realized Profit.
 */
export class FifoAccountingEngine {
  private dbHelper: DatabaseHelper;

  constructor(dbHelper: DatabaseHelper) {
    this.dbHelper = dbHelper;
  }

  // ============================================================================
  // 1. DEPOSIT (Create Original Capital Cash Lot)
  // ============================================================================

  public async deposit(
    portfolioId: number,
    amount: number,
    timestamp?: string
  ): Promise<{ transaction: Transaction; cashLot: TaxLot }> {
    const cleanAmount = roundCurrency(amount);
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      throw new Error('Deposit amount must be greater than zero.');
    }

    const createdAt = timestamp ?? new Date().toISOString();

    return this.dbHelper.withTransaction(async (driver) => {
      const txResult = await driver.runAsync(
        `INSERT INTO Transactions
          (portfolio_id, action_type, symbol, amount, price, total_value, created_at)
         VALUES (?, ?, NULL, ?, 1.0, ?, ?)`,
        portfolioId,
        ActionType.Deposit,
        cleanAmount,
        cleanAmount,
        createdAt
      );

      const lotResult = await driver.runAsync(
        `INSERT INTO Tax_Lots
          (portfolio_id, asset_type, symbol, original_amount, remaining_amount, cost_basis, is_realized, created_at)
         VALUES (?, ?, NULL, ?, ?, 1.0, 0, ?)`,
        portfolioId,
        AssetType.Cash,
        cleanAmount,
        cleanAmount,
        createdAt
      );

      const transaction: Transaction = {
        id: txResult.lastInsertRowId,
        portfolio_id: portfolioId,
        action_type: ActionType.Deposit,
        symbol: null,
        amount: cleanAmount,
        price: 1.0,
        total_value: cleanAmount,
        created_at: createdAt,
      };

      const cashLot: TaxLot = {
        id: lotResult.lastInsertRowId,
        portfolio_id: portfolioId,
        asset_type: AssetType.Cash,
        symbol: null,
        original_amount: cleanAmount,
        remaining_amount: cleanAmount,
        cost_basis: 1.0,
        is_realized: false,
        created_at: createdAt,
      };

      return { transaction, cashLot };
    });
  }

  // ============================================================================
  // 2. BUY STOCK (FIFO Deduction from Cash Lots -> Create Stock Lot(s))
  // ============================================================================

  public async buyStock(
    portfolioId: number,
    symbol: string,
    quantity: number,
    pricePerShare: number,
    timestamp?: string
  ): Promise<BuyExecutionResult> {
    const cleanSymbol = normalizeSymbol(symbol);
    const cleanQuantity = roundAmount(quantity);
    const cleanPrice = roundAmount(pricePerShare);
    const totalCost = roundCurrency(cleanQuantity * cleanPrice);

    if (!cleanSymbol) {
      throw new Error('Stock symbol is required.');
    }
    if (!Number.isFinite(cleanQuantity) || cleanQuantity <= 0) {
      throw new Error('Buy quantity must be greater than zero.');
    }
    if (!Number.isFinite(cleanPrice) || cleanPrice <= 0) {
      throw new Error('Buy price per share must be greater than zero.');
    }

    const createdAt = timestamp ?? new Date().toISOString();

    return this.dbHelper.withTransaction(async (driver) => {
      // Fetch available Cash Lots in strict FIFO order (oldest first)
      const openCashLots = await this.getOpenCashLots(driver, portfolioId);
      const totalAvailableCash = roundCurrency(
        openCashLots.reduce((sum, lot) => sum + lot.remaining_amount, 0)
      );

      if (totalAvailableCash + EPSILON < totalCost) {
        throw new Error(
          `Insufficient cash balance. Required: $${totalCost.toFixed(
            2
          )}, Available: $${totalAvailableCash.toFixed(2)}.`
        );
      }

      let remainingToPay = totalCost;
      let capitalUsed = 0;
      let profitReinvested = 0;
      const consumedCashLots: ConsumedLotDetail[] = [];

      for (const cashLot of openCashLots) {
        if (remainingToPay <= EPSILON) break;

        const deduction = roundCurrency(Math.min(cashLot.remaining_amount, remainingToPay));
        const newRemaining = roundCurrency(
          Math.max(0, cashLot.remaining_amount - deduction)
        );

        await driver.runAsync(
          'UPDATE Tax_Lots SET remaining_amount = ? WHERE id = ?',
          newRemaining <= EPSILON ? 0 : newRemaining,
          cashLot.id
        );

        if (cashLot.is_realized) {
          profitReinvested = roundCurrency(profitReinvested + deduction);
        } else {
          capitalUsed = roundCurrency(capitalUsed + deduction);
        }

        consumedCashLots.push({
          lotId: cashLot.id,
          assetType: AssetType.Cash,
          symbol: null,
          consumedAmount: deduction,
          costBasisPerUnit: cashLot.cost_basis,
          isRealizedProfitLot: cashLot.is_realized,
          createdAt: cashLot.created_at,
        });

        remainingToPay = roundCurrency(remainingToPay - deduction);
      }

      // Record the Buy Transaction in the Ledger
      const txResult = await driver.runAsync(
        `INSERT INTO Transactions
          (portfolio_id, action_type, symbol, amount, price, total_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        portfolioId,
        ActionType.Buy,
        cleanSymbol,
        cleanQuantity,
        cleanPrice,
        totalCost,
        createdAt
      );

      const createdStockLots: TaxLot[] = [];

      // Preserve Capital vs. Reinvested Profit lineage on the created Stock Lot(s)
      if (capitalUsed > EPSILON && profitReinvested > EPSILON) {
        const capitalRatio = capitalUsed / totalCost;
        const capitalShares = roundAmount(cleanQuantity * capitalRatio);
        const profitShares = roundAmount(cleanQuantity - capitalShares);

        if (capitalShares > EPSILON) {
          const capStockLot = await this.insertStockLot(
            driver,
            portfolioId,
            cleanSymbol,
            capitalShares,
            cleanPrice,
            false,
            createdAt
          );
          createdStockLots.push(capStockLot);
        }

        if (profitShares > EPSILON) {
          const profStockLot = await this.insertStockLot(
            driver,
            portfolioId,
            cleanSymbol,
            profitShares,
            cleanPrice,
            true,
            createdAt
          );
          createdStockLots.push(profStockLot);
        }
      } else {
        const isFundedByProfit = profitReinvested > capitalUsed;
        const stockLot = await this.insertStockLot(
          driver,
          portfolioId,
          cleanSymbol,
          cleanQuantity,
          cleanPrice,
          isFundedByProfit,
          createdAt
        );
        createdStockLots.push(stockLot);
      }

      const transaction: Transaction = {
        id: txResult.lastInsertRowId,
        portfolio_id: portfolioId,
        action_type: ActionType.Buy,
        symbol: cleanSymbol,
        amount: cleanQuantity,
        price: cleanPrice,
        total_value: totalCost,
        created_at: createdAt,
      };

      return {
        transaction,
        createdStockLots,
        consumedCashLots,
        capitalUsed,
        profitReinvested,
      };
    });
  }

  // ============================================================================
  // 3. SELL STOCK (FIFO Deduction from Stock Lots -> Create Capital & Profit Cash Lots)
  // ============================================================================

  public async sellStock(
    portfolioId: number,
    symbol: string,
    quantity: number,
    sellPricePerShare: number,
    timestamp?: string
  ): Promise<SellExecutionResult> {
    const cleanSymbol = normalizeSymbol(symbol);
    const cleanQuantity = roundAmount(quantity);
    const cleanSellPrice = roundAmount(sellPricePerShare);
    const totalProceeds = roundCurrency(cleanQuantity * cleanSellPrice);

    if (!cleanSymbol) {
      throw new Error('Stock symbol is required.');
    }
    if (!Number.isFinite(cleanQuantity) || cleanQuantity <= 0) {
      throw new Error('Sell quantity must be greater than zero.');
    }
    if (!Number.isFinite(cleanSellPrice) || cleanSellPrice < 0) {
      throw new Error('Sell price per share cannot be negative.');
    }

    const createdAt = timestamp ?? new Date().toISOString();

    return this.dbHelper.withTransaction(async (driver) => {
      // Fetch open Stock Lots for this symbol in strict FIFO order (oldest first)
      const openStockLots = await this.getOpenStockLotsBySymbol(
        driver,
        portfolioId,
        cleanSymbol
      );

      const totalAvailableShares = roundAmount(
        openStockLots.reduce((sum, lot) => sum + lot.remaining_amount, 0)
      );

      if (totalAvailableShares + EPSILON < cleanQuantity) {
        throw new Error(
          `Insufficient ${cleanSymbol} shares to sell. Requested: ${cleanQuantity}, Available: ${totalAvailableShares}.`
        );
      }

      let remainingSharesToSell = cleanQuantity;
      let totalCostBasis = 0;
      let recoveredOriginalCapital = 0;
      let realizedProfitCash = 0;
      const consumedStockLots: ConsumedLotDetail[] = [];

      for (const stockLot of openStockLots) {
        if (remainingSharesToSell <= EPSILON) break;

        const matchedShares = roundAmount(
          Math.min(stockLot.remaining_amount, remainingSharesToSell)
        );
        const newRemainingShares = roundAmount(
          Math.max(0, stockLot.remaining_amount - matchedShares)
        );

        await driver.runAsync(
          'UPDATE Tax_Lots SET remaining_amount = ? WHERE id = ?',
          newRemainingShares <= EPSILON ? 0 : newRemainingShares,
          stockLot.id
        );

        const lotCostBasis = roundCurrency(matchedShares * stockLot.cost_basis);
        const lotProceeds = roundCurrency(matchedShares * cleanSellPrice);
        const lotGain = roundCurrency(lotProceeds - lotCostBasis);

        totalCostBasis = roundCurrency(totalCostBasis + lotCostBasis);

        if (!stockLot.is_realized) {
          // Stock lot was originally funded by Capital (`is_realized = 0`)
          if (lotGain >= 0) {
            recoveredOriginalCapital = roundCurrency(
              recoveredOriginalCapital + lotCostBasis
            );
            realizedProfitCash = roundCurrency(realizedProfitCash + lotGain);
          } else {
            // Sold at a loss: recovered capital equals the surviving proceeds
            recoveredOriginalCapital = roundCurrency(
              recoveredOriginalCapital + lotProceeds
            );
          }
        } else {
          // Stock lot was funded by Reinvested Profit (`is_realized = 1`):
          // All surviving proceeds remain in the Realized Profit bucket
          realizedProfitCash = roundCurrency(realizedProfitCash + lotProceeds);
        }

        consumedStockLots.push({
          lotId: stockLot.id,
          assetType: AssetType.Stock,
          symbol: cleanSymbol,
          consumedAmount: matchedShares,
          costBasisPerUnit: stockLot.cost_basis,
          isRealizedProfitLot: stockLot.is_realized,
          createdAt: stockLot.created_at,
        });

        remainingSharesToSell = roundAmount(remainingSharesToSell - matchedShares);
      }

      const realizedPnL = roundCurrency(totalProceeds - totalCostBasis);

      // Record the Sell Transaction in the Ledger
      const txResult = await driver.runAsync(
        `INSERT INTO Transactions
          (portfolio_id, action_type, symbol, amount, price, total_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        portfolioId,
        ActionType.Sell,
        cleanSymbol,
        cleanQuantity,
        cleanSellPrice,
        totalProceeds,
        createdAt
      );

      let recoveredCapitalLot: TaxLot | null = null;
      let realizedProfitLot: TaxLot | null = null;

      // Cash Lot 1: Recovered Original Capital (`is_realized = 0`)
      if (recoveredOriginalCapital > EPSILON) {
        const capLotResult = await driver.runAsync(
          `INSERT INTO Tax_Lots
            (portfolio_id, asset_type, symbol, original_amount, remaining_amount, cost_basis, is_realized, created_at)
           VALUES (?, ?, NULL, ?, ?, 1.0, 0, ?)`,
          portfolioId,
          AssetType.Cash,
          recoveredOriginalCapital,
          recoveredOriginalCapital,
          createdAt
        );

        recoveredCapitalLot = {
          id: capLotResult.lastInsertRowId,
          portfolio_id: portfolioId,
          asset_type: AssetType.Cash,
          symbol: null,
          original_amount: recoveredOriginalCapital,
          remaining_amount: recoveredOriginalCapital,
          cost_basis: 1.0,
          is_realized: false,
          created_at: createdAt,
        };
      }

      // Cash Lot 2: Realized Profit (`is_realized = 1`)
      if (realizedProfitCash > EPSILON) {
        const profitLotResult = await driver.runAsync(
          `INSERT INTO Tax_Lots
            (portfolio_id, asset_type, symbol, original_amount, remaining_amount, cost_basis, is_realized, created_at)
           VALUES (?, ?, NULL, ?, ?, 1.0, 1, ?)`,
          portfolioId,
          AssetType.Cash,
          realizedProfitCash,
          realizedProfitCash,
          createdAt
        );

        realizedProfitLot = {
          id: profitLotResult.lastInsertRowId,
          portfolio_id: portfolioId,
          asset_type: AssetType.Cash,
          symbol: null,
          original_amount: realizedProfitCash,
          remaining_amount: realizedProfitCash,
          cost_basis: 1.0,
          is_realized: true,
          created_at: createdAt,
        };
      }

      const transaction: Transaction = {
        id: txResult.lastInsertRowId,
        portfolio_id: portfolioId,
        action_type: ActionType.Sell,
        symbol: cleanSymbol,
        amount: cleanQuantity,
        price: cleanSellPrice,
        total_value: totalProceeds,
        created_at: createdAt,
      };

      return {
        transaction,
        consumedStockLots,
        totalProceeds,
        totalCostBasis,
        realizedPnL,
        recoveredCapitalLot,
        realizedProfitLot,
      };
    });
  }

  // ============================================================================
  // 4. WITHDRAW & WITHDRAW SIMULATION (FIFO Capital vs. Profit Identification)
  // ============================================================================

  /**
   * Non-destructive FIFO simulation to preview how much of a proposed withdrawal
   * comes from Original Capital (tax-free return of principal) vs. Realized Profit (taxable).
   */
  public async simulateWithdraw(
    portfolioId: number,
    amount: number,
    estimatedTaxRatePercent: number = 15
  ): Promise<WithdrawBreakdown> {
    const cleanAmount = roundCurrency(amount);
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      throw new Error('Withdrawal amount must be greater than zero.');
    }

    const driver = this.dbHelper.getDriver();
    const openCashLots = await this.getOpenCashLots(driver, portfolioId);
    const totalAvailableCash = roundCurrency(
      openCashLots.reduce((sum, lot) => sum + lot.remaining_amount, 0)
    );

    if (totalAvailableCash + EPSILON < cleanAmount) {
      throw new Error(
        `Insufficient cash for withdrawal. Requested: $${cleanAmount.toFixed(
          2
        )}, Available: $${totalAvailableCash.toFixed(2)}.`
      );
    }

    let remainingToWithdraw = cleanAmount;
    let fromOriginalCapital = 0;
    let fromRealizedProfit = 0;
    const consumedCashLots: ConsumedLotDetail[] = [];

    for (const cashLot of openCashLots) {
      if (remainingToWithdraw <= EPSILON) break;

      const deduction = roundCurrency(
        Math.min(cashLot.remaining_amount, remainingToWithdraw)
      );

      if (cashLot.is_realized) {
        fromRealizedProfit = roundCurrency(fromRealizedProfit + deduction);
      } else {
        fromOriginalCapital = roundCurrency(fromOriginalCapital + deduction);
      }

      consumedCashLots.push({
        lotId: cashLot.id,
        assetType: AssetType.Cash,
        symbol: null,
        consumedAmount: deduction,
        costBasisPerUnit: cashLot.cost_basis,
        isRealizedProfitLot: cashLot.is_realized,
        createdAt: cashLot.created_at,
      });

      remainingToWithdraw = roundCurrency(remainingToWithdraw - deduction);
    }

    const taxRate = Math.max(0, estimatedTaxRatePercent) / 100;
    const estimatedTax = roundCurrency(fromRealizedProfit * taxRate);
    const netAfterTax = roundCurrency(cleanAmount - estimatedTax);
    const effectiveTaxRatePercent =
      cleanAmount > 0 ? roundCurrency((estimatedTax / cleanAmount) * 100) : 0;

    return {
      requestedAmount: cleanAmount,
      fromOriginalCapital,
      fromRealizedProfit,
      taxableAmount: fromRealizedProfit,
      taxFreeAmount: fromOriginalCapital,
      estimatedTax,
      netAfterTax,
      effectiveTaxRatePercent,
      consumedCashLots,
    };
  }

  /**
   * Executes an actual withdrawal by deducting from the oldest Cash Lots in FIFO order
   * and recording the Withdraw transaction.
   */
  public async withdraw(
    portfolioId: number,
    amount: number,
    estimatedTaxRatePercent: number = 15,
    timestamp?: string
  ): Promise<{ transaction: Transaction; breakdown: WithdrawBreakdown }> {
    const cleanAmount = roundCurrency(amount);
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      throw new Error('Withdrawal amount must be greater than zero.');
    }

    const createdAt = timestamp ?? new Date().toISOString();

    return this.dbHelper.withTransaction(async (driver) => {
      const openCashLots = await this.getOpenCashLots(driver, portfolioId);
      const totalAvailableCash = roundCurrency(
        openCashLots.reduce((sum, lot) => sum + lot.remaining_amount, 0)
      );

      if (totalAvailableCash + EPSILON < cleanAmount) {
        throw new Error(
          `Insufficient cash for withdrawal. Requested: $${cleanAmount.toFixed(
            2
          )}, Available: $${totalAvailableCash.toFixed(2)}.`
        );
      }

      let remainingToWithdraw = cleanAmount;
      let fromOriginalCapital = 0;
      let fromRealizedProfit = 0;
      const consumedCashLots: ConsumedLotDetail[] = [];

      for (const cashLot of openCashLots) {
        if (remainingToWithdraw <= EPSILON) break;

        const deduction = roundCurrency(
          Math.min(cashLot.remaining_amount, remainingToWithdraw)
        );
        const newRemaining = roundCurrency(
          Math.max(0, cashLot.remaining_amount - deduction)
        );

        await driver.runAsync(
          'UPDATE Tax_Lots SET remaining_amount = ? WHERE id = ?',
          newRemaining <= EPSILON ? 0 : newRemaining,
          cashLot.id
        );

        if (cashLot.is_realized) {
          fromRealizedProfit = roundCurrency(fromRealizedProfit + deduction);
        } else {
          fromOriginalCapital = roundCurrency(fromOriginalCapital + deduction);
        }

        consumedCashLots.push({
          lotId: cashLot.id,
          assetType: AssetType.Cash,
          symbol: null,
          consumedAmount: deduction,
          costBasisPerUnit: cashLot.cost_basis,
          isRealizedProfitLot: cashLot.is_realized,
          createdAt: cashLot.created_at,
        });

        remainingToWithdraw = roundCurrency(remainingToWithdraw - deduction);
      }

      const txResult = await driver.runAsync(
        `INSERT INTO Transactions
          (portfolio_id, action_type, symbol, amount, price, total_value, created_at)
         VALUES (?, ?, NULL, ?, 1.0, ?, ?)`,
        portfolioId,
        ActionType.Withdraw,
        cleanAmount,
        cleanAmount,
        createdAt
      );

      const taxRate = Math.max(0, estimatedTaxRatePercent) / 100;
      const estimatedTax = roundCurrency(fromRealizedProfit * taxRate);
      const netAfterTax = roundCurrency(cleanAmount - estimatedTax);
      const effectiveTaxRatePercent =
        cleanAmount > 0 ? roundCurrency((estimatedTax / cleanAmount) * 100) : 0;

      const transaction: Transaction = {
        id: txResult.lastInsertRowId,
        portfolio_id: portfolioId,
        action_type: ActionType.Withdraw,
        symbol: null,
        amount: cleanAmount,
        price: 1.0,
        total_value: cleanAmount,
        created_at: createdAt,
      };

      const breakdown: WithdrawBreakdown = {
        requestedAmount: cleanAmount,
        fromOriginalCapital,
        fromRealizedProfit,
        taxableAmount: fromRealizedProfit,
        taxFreeAmount: fromOriginalCapital,
        estimatedTax,
        netAfterTax,
        effectiveTaxRatePercent,
        consumedCashLots,
      };

      return { transaction, breakdown };
    });
  }

  // ============================================================================
  // 5. DASHBOARD METRICS & QUERIES
  // ============================================================================

  public async getDashboardMetrics(portfolioId: number): Promise<DashboardMetrics> {
    const driver = this.dbHelper.getDriver();

    const portfolio = await driver.getFirstAsync<Portfolio>(
      'SELECT id, name, currency FROM Portfolios WHERE id = ?',
      portfolioId
    );
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found.`);
    }

    // Active Cash Lots
    const openCashLots = await this.getOpenCashLots(driver, portfolioId);
    let capitalCashBalance = 0;
    let profitCashBalance = 0;

    for (const lot of openCashLots) {
      if (lot.is_realized) {
        profitCashBalance = roundCurrency(profitCashBalance + lot.remaining_amount);
      } else {
        capitalCashBalance = roundCurrency(capitalCashBalance + lot.remaining_amount);
      }
    }
    const totalCashBalance = roundCurrency(capitalCashBalance + profitCashBalance);

    // Active Stock Lots
    const openStockRows = await driver.getAllAsync<TaxLotRow>(
      `SELECT id, portfolio_id, asset_type, symbol, original_amount, remaining_amount, cost_basis, is_realized, created_at
       FROM Tax_Lots
       WHERE portfolio_id = ? AND asset_type = ? AND remaining_amount > ?
       ORDER BY created_at ASC, id ASC`,
      portfolioId,
      AssetType.Stock,
      EPSILON
    );
    const openStockLots = openStockRows.map(mapTaxLotRow);

    const holdingsMap = new Map<string, StockHoldingSummary>();
    let investedStockCostBasis = 0;
    let capitalInStocks = 0;
    let profitInStocks = 0;

    for (const lot of openStockLots) {
      const sym = lot.symbol ?? 'UNKNOWN';
      const lotValue = roundCurrency(lot.remaining_amount * lot.cost_basis);
      investedStockCostBasis = roundCurrency(investedStockCostBasis + lotValue);

      if (lot.is_realized) {
        profitInStocks = roundCurrency(profitInStocks + lotValue);
      } else {
        capitalInStocks = roundCurrency(capitalInStocks + lotValue);
      }

      const existing = holdingsMap.get(sym) ?? {
        symbol: sym,
        totalShares: 0,
        averageCostBasis: 0,
        totalCostBasis: 0,
        capitalFundedBasis: 0,
        profitFundedBasis: 0,
      };

      existing.totalShares = roundAmount(existing.totalShares + lot.remaining_amount);
      existing.totalCostBasis = roundCurrency(existing.totalCostBasis + lotValue);
      if (lot.is_realized) {
        existing.profitFundedBasis = roundCurrency(existing.profitFundedBasis + lotValue);
      } else {
        existing.capitalFundedBasis = roundCurrency(
          existing.capitalFundedBasis + lotValue
        );
      }
      existing.averageCostBasis =
        existing.totalShares > 0
          ? roundCurrency(existing.totalCostBasis / existing.totalShares)
          : 0;

      holdingsMap.set(sym, existing);
    }

    // Total Capital Injected (Gross Deposits)
    const depositSumRow = await driver.getFirstAsync<{ total_deposits: number | null }>(
      `SELECT SUM(total_value) AS total_deposits
       FROM Transactions
       WHERE portfolio_id = ? AND action_type = ?`,
      portfolioId,
      ActionType.Deposit
    );
    const totalCapitalInjected = roundCurrency(depositSumRow?.total_deposits ?? 0);

    // Net Capital Remaining inside Portfolio (Cash Capital + Stock Capital)
    const netCapitalRemaining = roundCurrency(capitalCashBalance + capitalInStocks);

    // Net Realized Profit:
    // Sum of all Realized Profit Lots ever created minus any trading losses on capital
    const allProfitLotsRow = await driver.getFirstAsync<{ total_profit_lots: number | null }>(
      `SELECT SUM(original_amount) AS total_profit_lots
       FROM Tax_Lots
       WHERE portfolio_id = ? AND asset_type = ? AND is_realized = 1`,
      portfolioId,
      AssetType.Cash
    );
    const currentProfitPool = roundCurrency(profitCashBalance + profitInStocks);
    // Also compute total withdrawals to know cumulative realized profit accurately
    const withdrawRow = await driver.getFirstAsync<{ total_withdrawn: number | null }>(
      `SELECT SUM(total_value) AS total_withdrawn
       FROM Transactions
       WHERE portfolio_id = ? AND action_type = ?`,
      portfolioId,
      ActionType.Withdraw
    );
    const totalWithdrawn = roundCurrency(withdrawRow?.total_withdrawn ?? 0);
    const totalPortfolioValue = roundCurrency(totalCashBalance + investedStockCostBasis);

    // Accounting identity:
    // Total Portfolio Value + Total Withdrawn - Total Capital Injected = Cumulative Net Realized Profit
    const netRealizedProfit = roundCurrency(
      totalPortfolioValue + totalWithdrawn - totalCapitalInjected
    );

    // Suppress unused warning for allProfitLotsRow/currentProfitPool while keeping clarity
    void allProfitLotsRow;
    void currentProfitPool;

    return {
      portfolio,
      totalPortfolioValue,
      totalCashBalance,
      capitalCashBalance,
      profitCashBalance,
      investedStockCostBasis,
      totalCapitalInjected,
      netCapitalRemaining,
      netRealizedProfit,
      holdings: Array.from(holdingsMap.values()),
    };
  }

  public async getActiveTaxLots(portfolioId: number): Promise<TaxLot[]> {
    const driver = this.dbHelper.getDriver();
    const rows = await driver.getAllAsync<TaxLotRow>(
      `SELECT id, portfolio_id, asset_type, symbol, original_amount, remaining_amount, cost_basis, is_realized, created_at
       FROM Tax_Lots
       WHERE portfolio_id = ? AND remaining_amount > ?
       ORDER BY created_at ASC, id ASC`,
      portfolioId,
      EPSILON
    );
    return rows.map(mapTaxLotRow);
  }

  public async getAllTaxLots(portfolioId: number): Promise<TaxLot[]> {
    const driver = this.dbHelper.getDriver();
    const rows = await driver.getAllAsync<TaxLotRow>(
      `SELECT id, portfolio_id, asset_type, symbol, original_amount, remaining_amount, cost_basis, is_realized, created_at
       FROM Tax_Lots
       WHERE portfolio_id = ?
       ORDER BY created_at ASC, id ASC`,
      portfolioId
    );
    return rows.map(mapTaxLotRow);
  }

  public async getTransactions(portfolioId: number): Promise<Transaction[]> {
    const driver = this.dbHelper.getDriver();
    return driver.getAllAsync<Transaction>(
      `SELECT id, portfolio_id, action_type, symbol, amount, price, total_value, created_at
       FROM Transactions
       WHERE portfolio_id = ?
       ORDER BY created_at DESC, id DESC`,
      portfolioId
    );
  }

  // ============================================================================
  // PRIVATE FIFO QUERY HELPERS
  // ============================================================================

  private async getOpenCashLots(
    driver: SQLiteDriver,
    portfolioId: number
  ): Promise<TaxLot[]> {
    const rows = await driver.getAllAsync<TaxLotRow>(
      `SELECT id, portfolio_id, asset_type, symbol, original_amount, remaining_amount, cost_basis, is_realized, created_at
       FROM Tax_Lots
       WHERE portfolio_id = ? AND asset_type = ? AND remaining_amount > ?
       ORDER BY created_at ASC, id ASC`,
      portfolioId,
      AssetType.Cash,
      EPSILON
    );
    return rows.map(mapTaxLotRow);
  }

  private async getOpenStockLotsBySymbol(
    driver: SQLiteDriver,
    portfolioId: number,
    symbol: string
  ): Promise<TaxLot[]> {
    const rows = await driver.getAllAsync<TaxLotRow>(
      `SELECT id, portfolio_id, asset_type, symbol, original_amount, remaining_amount, cost_basis, is_realized, created_at
       FROM Tax_Lots
       WHERE portfolio_id = ? AND asset_type = ? AND symbol = ? AND remaining_amount > ?
       ORDER BY created_at ASC, id ASC`,
      portfolioId,
      AssetType.Stock,
      symbol,
      EPSILON
    );
    return rows.map(mapTaxLotRow);
  }

  private async insertStockLot(
    driver: SQLiteDriver,
    portfolioId: number,
    symbol: string,
    quantity: number,
    costBasis: number,
    isFundedByProfit: boolean,
    createdAt: string
  ): Promise<TaxLot> {
    const result = await driver.runAsync(
      `INSERT INTO Tax_Lots
        (portfolio_id, asset_type, symbol, original_amount, remaining_amount, cost_basis, is_realized, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      portfolioId,
      AssetType.Stock,
      symbol,
      quantity,
      quantity,
      costBasis,
      isFundedByProfit ? 1 : 0,
      createdAt
    );

    return {
      id: result.lastInsertRowId,
      portfolio_id: portfolioId,
      asset_type: AssetType.Stock,
      symbol,
      original_amount: quantity,
      remaining_amount: quantity,
      cost_basis: costBasis,
      is_realized: isFundedByProfit,
      created_at: createdAt,
    };
  }
}

