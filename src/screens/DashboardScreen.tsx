import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LotBadge } from '../components/LotBadge.tsx';
import { MetricCard } from '../components/MetricCard.tsx';
import { WithdrawSimulatorCard } from '../components/WithdrawSimulatorCard.tsx';
import { AssetType } from '../types/models.ts';
import type {
  DashboardMetrics,
  TaxLot,
  Transaction,
  WithdrawBreakdown,
} from '../types/models.ts';

interface DashboardScreenProps {
  metrics: DashboardMetrics;
  activeLots: TaxLot[];
  transactions: Transaction[];
  onSimulateWithdraw: (
    amount: number,
    taxRatePercent: number
  ) => Promise<WithdrawBreakdown>;
  onNavigateQuickEntry: () => void;
}

function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  metrics,
  activeLots,
  transactions,
  onSimulateWithdraw,
  onNavigateQuickEntry,
}) => {
  const profitColor = metrics.netRealizedProfit >= 0 ? '#34D399' : '#F87171';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Hero Banner: Total Portfolio Value */}
      <View style={styles.heroCard}>
        <View style={styles.heroHeaderRow}>
          <View>
            <Text style={styles.portfolioName}>
              {metrics.portfolio.name} ({metrics.portfolio.currency})
            </Text>
            <Text style={styles.heroLabel}>Total Portfolio Value</Text>
          </View>
          <TouchableOpacity
            style={styles.quickActionPill}
            onPress={onNavigateQuickEntry}
          >
            <Text style={styles.quickActionPillText}>+ Quick Entry</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.heroValue}>
          {formatMoney(metrics.totalPortfolioValue)}
        </Text>

        <View style={styles.heroBreakdownRow}>
          <View style={styles.heroBreakdownItem}>
            <Text style={styles.breakdownLabel}>Cash Balance</Text>
            <Text style={styles.breakdownValue}>
              {formatMoney(metrics.totalCashBalance)}
            </Text>
            <Text style={styles.breakdownSub}>
              {formatMoney(metrics.capitalCashBalance)} Cap •{' '}
              {formatMoney(metrics.profitCashBalance)} Profit
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.heroBreakdownItem}>
            <Text style={styles.breakdownLabel}>Stock Cost Basis</Text>
            <Text style={styles.breakdownValue}>
              {formatMoney(metrics.investedStockCostBasis)}
            </Text>
            <Text style={styles.breakdownSub}>
              {metrics.holdings.length} Active Position(s)
            </Text>
          </View>
        </View>
      </View>

      {/* Distinctly Separated Core Metrics: Total Capital Injected vs. Net Realized Profit */}
      <View style={styles.metricsRow}>
        <MetricCard
          title="Total Capital Injected"
          value={formatMoney(metrics.totalCapitalInjected)}
          subtitle={`Active Principal: ${formatMoney(metrics.netCapitalRemaining)}`}
          accentColor="#38BDF8"
        />
        <MetricCard
          title="Net Realized Profit"
          value={formatMoney(metrics.netRealizedProfit)}
          subtitle={`Profit in Cash: ${formatMoney(metrics.profitCashBalance)}`}
          accentColor={profitColor}
        />
      </View>

      {/* Withdraw Simulation Feature */}
      <WithdrawSimulatorCard
        availableCash={metrics.totalCashBalance}
        onSimulate={onSimulateWithdraw}
      />

      {/* Active FIFO Tax Lots Queue */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          Active FIFO Tax Lots ({activeLots.length})
        </Text>
        <Text style={styles.sectionHint}>Oldest Consumed First</Text>
      </View>

      {activeLots.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            No active tax lots yet. Tap "+ Quick Entry" to deposit capital.
          </Text>
        </View>
      ) : (
        activeLots.map((lot, index) => (
          <View key={lot.id} style={styles.lotCard}>
            <View style={styles.lotCardTop}>
              <Text style={styles.fifoOrderBadge}>
                FIFO #{index + 1} • Lot #{lot.id}
              </Text>
              <LotBadge
                assetType={lot.asset_type}
                isRealized={lot.is_realized}
                symbol={lot.symbol}
              />
            </View>
            <View style={styles.lotCardBottom}>
              <View>
                <Text style={styles.lotPrimaryText}>
                  {lot.asset_type === AssetType.Cash
                    ? `${formatMoney(lot.remaining_amount)} remaining`
                    : `${lot.remaining_amount} ${lot.symbol} @ ${formatMoney(
                        lot.cost_basis
                      )}/sh`}
                </Text>
                <Text style={styles.lotSecondaryText}>
                  Original:{' '}
                  {lot.asset_type === AssetType.Cash
                    ? formatMoney(lot.original_amount)
                    : `${lot.original_amount} shares`}{' '}
                  • {new Date(lot.created_at).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.lotTotalValue}>
                {formatMoney(lot.remaining_amount * lot.cost_basis)}
              </Text>
            </View>
          </View>
        ))
      )}

      {/* Recent Ledger Transactions */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          Recent Ledger ({transactions.length})
        </Text>
      </View>

      {transactions.slice(0, 10).map((tx) => (
        <View key={tx.id} style={styles.txRow}>
          <View>
            <Text style={styles.txActionText}>
              {tx.action_type} {tx.symbol ? `• ${tx.symbol}` : ''}
            </Text>
            <Text style={styles.txSubText}>
              {tx.symbol
                ? `${tx.amount} sh @ ${formatMoney(tx.price)}`
                : 'Cash Action'}{' '}
              • {new Date(tx.created_at).toLocaleDateString()}
            </Text>
          </View>
          <Text style={styles.txValueText}>{formatMoney(tx.total_value)}</Text>
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: '#1E293B',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 14,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  portfolioName: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
    marginBottom: 2,
  },
  heroLabel: {
    fontSize: 14,
    color: '#CBD5E1',
    fontWeight: '600',
  },
  quickActionPill: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  quickActionPillText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 12,
  },
  heroValue: {
    fontSize: 34,
    fontWeight: '900',
    color: '#F8FAFC',
    marginVertical: 10,
  },
  heroBreakdownRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 12,
    marginTop: 4,
  },
  heroBreakdownItem: {
    flex: 1,
  },
  divider: {
    width: 1,
    backgroundColor: '#334155',
    marginHorizontal: 14,
  },
  breakdownLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  breakdownValue: {
    fontSize: 16,
    color: '#F8FAFC',
    fontWeight: '700',
    marginTop: 2,
  },
  breakdownSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  sectionHint: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyBox: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
  },
  lotCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  lotCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fifoOrderBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  lotCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lotPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  lotSecondaryText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  lotTotalValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#E2E8F0',
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  txActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  txSubText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  txValueText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#CBD5E1',
  },
});

