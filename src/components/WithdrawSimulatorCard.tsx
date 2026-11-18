import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { WithdrawBreakdown } from '../types/models.ts';

interface WithdrawSimulatorCardProps {
  availableCash: number;
  onSimulate: (amount: number, taxRatePercent: number) => Promise<WithdrawBreakdown>;
}

export const WithdrawSimulatorCard: React.FC<WithdrawSimulatorCardProps> = ({
  availableCash,
  onSimulate,
}) => {
  const [amountInput, setAmountInput] = useState<string>('');
  const [taxRateInput, setTaxRateInput] = useState<string>('15');
  const [result, setResult] = useState<WithdrawBreakdown | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  const handleRunSimulation = async () => {
    setSimError(null);
    const parsedAmount = parseFloat(amountInput);
    const parsedTaxRate = parseFloat(taxRateInput) || 0;

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setSimError('Enter a valid withdrawal amount greater than $0.');
      setResult(null);
      return;
    }

    try {
      const breakdown = await onSimulate(parsedAmount, parsedTaxRate);
      setResult(breakdown);
    } catch (err) {
      setResult(null);
      setSimError(err instanceof Error ? err.message : 'Simulation failed.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>🧪 Withdraw Tax Simulator (FIFO)</Text>
        <Text style={styles.cashHint}>
          Available Cash: ${availableCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </Text>
      </View>
      <Text style={styles.description}>
        Preview how much of a withdrawal comes from tax-free Original Capital vs. taxable
        Realized Profit before withdrawing.
      </Text>

      <View style={styles.inputRow}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Simulate Amount ($)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 1500"
            placeholderTextColor="#64748B"
            keyboardType="decimal-pad"
            value={amountInput}
            onChangeText={setAmountInput}
          />
        </View>

        <View style={[styles.inputGroup, { flex: 0.55 }]}>
          <Text style={styles.inputLabel}>Tax Rate (%)</Text>
          <TextInput
            style={styles.input}
            placeholder="15"
            placeholderTextColor="#64748B"
            keyboardType="decimal-pad"
            value={taxRateInput}
            onChangeText={setTaxRateInput}
          />
        </View>

        <TouchableOpacity style={styles.simButton} onPress={handleRunSimulation}>
          <Text style={styles.simButtonText}>Simulate</Text>
        </TouchableOpacity>
      </View>

      {simError ? <Text style={styles.errorText}>{simError}</Text> : null}

      {result ? (
        <View style={styles.resultBox}>
          <View style={styles.splitRow}>
            <View style={styles.splitCol}>
              <Text style={styles.splitLabel}>🛡️ From Original Capital</Text>
              <Text style={[styles.splitValue, { color: '#38BDF8' }]}>
                ${result.fromOriginalCapital.toFixed(2)}
              </Text>
              <Text style={styles.splitSub}>Tax-Free (Return of Capital)</Text>
            </View>

            <View style={styles.splitCol}>
              <Text style={styles.splitLabel}>✨ From Realized Profit</Text>
              <Text style={[styles.splitValue, { color: '#34D399' }]}>
                ${result.fromRealizedProfit.toFixed(2)}
              </Text>
              <Text style={styles.splitSub}>Taxable Capital Gains</Text>
            </View>
          </View>

          <View style={styles.taxSummaryRow}>
            <Text style={styles.taxSummaryText}>
              Est. Tax: <Text style={styles.taxHighlight}>${result.estimatedTax.toFixed(2)}</Text>
              {'  '}({result.effectiveTaxRatePercent.toFixed(1)}% effective)
            </Text>
            <Text style={styles.netPayoutText}>
              Net After Tax: ${result.netAfterTax.toFixed(2)}
            </Text>
          </View>

          <Text style={styles.lotsHeader}>
            FIFO Cash Lots Matched ({result.consumedCashLots.length}):
          </Text>
          {result.consumedCashLots.map((lot) => (
            <View key={lot.lotId} style={styles.lotRow}>
              <Text style={styles.lotIdText}>
                Lot #{lot.lotId} ({lot.isRealizedProfitLot ? 'Profit' : 'Capital'})
              </Text>
              <Text style={styles.lotAmountText}>
                -${lot.consumedAmount.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  cashHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  description: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 14,
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 4,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
  },
  simButton: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  simButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  errorText: {
    color: '#F87171',
    fontSize: 12,
    marginTop: 10,
    fontWeight: '600',
  },
  resultBox: {
    marginTop: 14,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  splitCol: {
    flex: 1,
    backgroundColor: '#1E293B',
    padding: 10,
    borderRadius: 10,
  },
  splitLabel: {
    fontSize: 11,
    color: '#CBD5E1',
    fontWeight: '600',
    marginBottom: 4,
  },
  splitValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  splitSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  taxSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 10,
    marginBottom: 10,
  },
  taxSummaryText: {
    fontSize: 12,
    color: '#CBD5E1',
  },
  taxHighlight: {
    color: '#FBBF24',
    fontWeight: '700',
  },
  netPayoutText: {
    fontSize: 12,
    color: '#F8FAFC',
    fontWeight: '700',
  },
  lotsHeader: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '700',
    marginBottom: 6,
  },
  lotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  lotIdText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  lotAmountText: {
    fontSize: 12,
    color: '#E2E8F0',
    fontWeight: '600',
  },
});

