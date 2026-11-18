/**
 * Domain models & TypeScript types for Port Trail FIFO Tax & Capital Engine.
 */

export const ActionType = {
  Deposit: 'Deposit',
  Buy: 'Buy',
  Sell: 'Sell',
  Withdraw: 'Withdraw',
} as const;

export type ActionType = (typeof ActionType)[keyof typeof ActionType];

export const AssetType = {
  Cash: 'Cash',
  Stock: 'Stock',
} as const;

export type AssetType = (typeof AssetType)[keyof typeof AssetType];

/**
 * Portfolios table record
 */
export interface Portfolio {
  id: number;
  name: string;
  currency: string;
}

/**
 * Transactions table record (The Immutable Ledger)
 */
export interface Transaction {
  id: number;
  portfolio_id: number;
  action_type: ActionType;
  symbol: string | null;
  amount: number;
  price: number;
  total_value: number;
  created_at: string;
}

/**
 * Tax_Lots table record (The FIFO Engine)
 *
 * Note on `is_realized` (stored as 0 or 1 in SQLite):
 * - For `Cash` lots:
 *   - `false` (0) = Original Capital lot (from user Deposits or recovered principal from Stock sales)
 *   - `true` (1)  = Realized Profit lot (net gain generated from Stock sales)
 * - For `Stock` lots:
 *   - `false` (0) = Stock lot funded by Original Capital cash
 *   - `true` (1)  = Stock lot funded by Reinvested Profit cash
 */
export interface TaxLot {
  id: number;
  portfolio_id: number;
  asset_type: AssetType;
  symbol: string | null;
  original_amount: number;
  remaining_amount: number;
  cost_basis: number;
  is_realized: boolean;
  created_at: string;
}

/**
 * Raw SQLite row representation of Tax_Lots where `is_realized` is an integer (0 or 1).
 */
export interface TaxLotRow {
  id: number;
  portfolio_id: number;
  asset_type: AssetType;
  symbol: string | null;
  original_amount: number;
  remaining_amount: number;
  cost_basis: number;
  is_realized: number;
  created_at: string;
}

/**
 * Details of a single lot deduction during a FIFO operation.
 */
export interface ConsumedLotDetail {
  lotId: number;
  assetType: AssetType;
  symbol: string | null;
  consumedAmount: number;
  costBasisPerUnit: number;
  isRealizedProfitLot: boolean;
  createdAt: string;
}

/**
 * Result returned after executing a Buy action.
 */
export interface BuyExecutionResult {
  transaction: Transaction;
  createdStockLots: TaxLot[];
  consumedCashLots: ConsumedLotDetail[];
  capitalUsed: number;
  profitReinvested: number;
}

/**
 * Result returned after executing a Sell action.
 */
export interface SellExecutionResult {
  transaction: Transaction;
  consumedStockLots: ConsumedLotDetail[];
  totalProceeds: number;
  totalCostBasis: number;
  realizedPnL: number;
  recoveredCapitalLot: TaxLot | null;
  realizedProfitLot: TaxLot | null;
}

/**
 * Result returned by both Withdraw Simulation and actual Withdraw execution.
 */
export interface WithdrawBreakdown {
  requestedAmount: number;
  fromOriginalCapital: number;
  fromRealizedProfit: number;
  taxableAmount: number;
  taxFreeAmount: number;
  estimatedTax: number;
  netAfterTax: number;
  effectiveTaxRatePercent: number;
  consumedCashLots: ConsumedLotDetail[];
}

/**
 * Aggregated metrics for the Dashboard screen.
 */
export interface DashboardMetrics {
  portfolio: Portfolio;
  totalPortfolioValue: number;
  totalCashBalance: number;
  capitalCashBalance: number;
  profitCashBalance: number;
  investedStockCostBasis: number;
  totalCapitalInjected: number;
  netCapitalRemaining: number;
  netRealizedProfit: number;
  holdings: StockHoldingSummary[];
}

export interface StockHoldingSummary {
  symbol: string;
  totalShares: number;
  averageCostBasis: number;
  totalCostBasis: number;
  capitalFundedBasis: number;
  profitFundedBasis: number;
}

