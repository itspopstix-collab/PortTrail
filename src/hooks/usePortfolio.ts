import { useCallback, useEffect, useState } from 'react';
import { DatabaseHelper } from '../database/DatabaseHelper.ts';
import { FifoAccountingEngine } from '../services/FifoAccountingEngine.ts';
import type {
  BuyExecutionResult,
  DashboardMetrics,
  SellExecutionResult,
  TaxLot,
  Transaction,
  WithdrawBreakdown,
} from '../types/models.ts';

export interface UsePortfolioState {
  loading: boolean;
  error: string | null;
  portfolioId: number | null;
  metrics: DashboardMetrics | null;
  activeLots: TaxLot[];
  transactions: Transaction[];
  refresh: () => Promise<void>;
  deposit: (amount: number) => Promise<{ transaction: Transaction; cashLot: TaxLot }>;
  buyStock: (
    symbol: string,
    quantity: number,
    price: number
  ) => Promise<BuyExecutionResult>;
  sellStock: (
    symbol: string,
    quantity: number,
    price: number
  ) => Promise<SellExecutionResult>;
  withdraw: (
    amount: number,
    taxRatePercent?: number
  ) => Promise<{ transaction: Transaction; breakdown: WithdrawBreakdown }>;
  simulateWithdraw: (
    amount: number,
    taxRatePercent?: number
  ) => Promise<WithdrawBreakdown>;
}

export function usePortfolio(): UsePortfolioState {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [portfolioId, setPortfolioId] = useState<number | null>(null);
  const [engine, setEngine] = useState<FifoAccountingEngine | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [activeLots, setActiveLots] = useState<TaxLot[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const loadPortfolioData = useCallback(
    async (activeEngine: FifoAccountingEngine, pid: number) => {
      const [nextMetrics, nextLots, nextTransactions] = await Promise.all([
        activeEngine.getDashboardMetrics(pid),
        activeEngine.getActiveTaxLots(pid),
        activeEngine.getTransactions(pid),
      ]);
      setMetrics(nextMetrics);
      setActiveLots(nextLots);
      setTransactions(nextTransactions);
    },
    []
  );

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        setLoading(true);
        const dbHelper = await DatabaseHelper.getInstance();
        const defaultPortfolio = await dbHelper.ensureDefaultPortfolio();
        const fifoEngine = new FifoAccountingEngine(dbHelper);

        if (!isMounted) return;
        setPortfolioId(defaultPortfolio.id);
        setEngine(fifoEngine);
        await loadPortfolioData(fifoEngine, defaultPortfolio.id);
        setError(null);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize database.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    bootstrap();
    return () => {
      isMounted = false;
    };
  }, [loadPortfolioData]);

  const refresh = useCallback(async () => {
    if (!engine || portfolioId === null) return;
    await loadPortfolioData(engine, portfolioId);
  }, [engine, portfolioId, loadPortfolioData]);

  const deposit = useCallback(
    async (amount: number) => {
      if (!engine || portfolioId === null) {
        throw new Error('Portfolio engine is not ready.');
      }
      const res = await engine.deposit(portfolioId, amount);
      await loadPortfolioData(engine, portfolioId);
      return res;
    },
    [engine, portfolioId, loadPortfolioData]
  );

  const buyStock = useCallback(
    async (symbol: string, quantity: number, price: number) => {
      if (!engine || portfolioId === null) {
        throw new Error('Portfolio engine is not ready.');
      }
      const res = await engine.buyStock(portfolioId, symbol, quantity, price);
      await loadPortfolioData(engine, portfolioId);
      return res;
    },
    [engine, portfolioId, loadPortfolioData]
  );

  const sellStock = useCallback(
    async (symbol: string, quantity: number, price: number) => {
      if (!engine || portfolioId === null) {
        throw new Error('Portfolio engine is not ready.');
      }
      const res = await engine.sellStock(portfolioId, symbol, quantity, price);
      await loadPortfolioData(engine, portfolioId);
      return res;
    },
    [engine, portfolioId, loadPortfolioData]
  );

  const withdraw = useCallback(
    async (amount: number, taxRatePercent: number = 15) => {
      if (!engine || portfolioId === null) {
        throw new Error('Portfolio engine is not ready.');
      }
      const res = await engine.withdraw(portfolioId, amount, taxRatePercent);
      await loadPortfolioData(engine, portfolioId);
      return res;
    },
    [engine, portfolioId, loadPortfolioData]
  );

  const simulateWithdraw = useCallback(
    async (amount: number, taxRatePercent: number = 15) => {
      if (!engine || portfolioId === null) {
        throw new Error('Portfolio engine is not ready.');
      }
      return engine.simulateWithdraw(portfolioId, amount, taxRatePercent);
    },
    [engine, portfolioId]
  );

  return {
    loading,
    error,
    portfolioId,
    metrics,
    activeLots,
    transactions,
    refresh,
    deposit,
    buyStock,
    sellStock,
    withdraw,
    simulateWithdraw,
  };
}

