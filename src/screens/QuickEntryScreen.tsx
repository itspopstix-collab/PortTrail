import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ActionType } from '../types/models.ts';
import type {
  BuyExecutionResult,
  SellExecutionResult,
  TaxLot,
  Transaction,
  WithdrawBreakdown,
} from '../types/models.ts';

interface QuickEntryScreenProps {
  availableCash: number;
  onDeposit: (amount: number) => Promise<{ transaction: Transaction; cashLot: TaxLot }>;
  onBuy: (
    symbol: string,
    quantity: number,
    price: number
  ) => Promise<BuyExecutionResult>;
  onSell: (
    symbol: string,
    quantity: number,
    price: number
  ) => Promise<SellExecutionResult>;
  onWithdraw: (
    amount: number
  ) => Promise<{ transaction: Transaction; breakdown: WithdrawBreakdown }>;
}

const ACTION_CARDS: {
  type: ActionType;
  icon: string;
  label: string;
  hint: string;
  accent: string;
}[] = [
  {
    type: ActionType.Deposit,
    icon: '📥',
    label: 'Deposit',
    hint: 'Creates Capital Cash Lot',
    accent: '#38BDF8',
  },
  {
    type: ActionType.Buy,
    icon: '🛒',
    label: 'Buy',
    hint: 'FIFO Cash → Stock Lot',
    accent: '#A78BFA',
  },
  {
    type: ActionType.Sell,
    icon: '💰',
    label: 'Sell',
    hint: 'Splits Capital & Profit Lots',
    accent: '#34D399',
  },
  {
    type: ActionType.Withdraw,
    icon: '📤',
    label: 'Withdraw',
    hint: 'FIFO Capital vs. Profit',
    accent: '#FBBF24',
  },
];

export const QuickEntryScreen: React.FC<QuickEntryScreenProps> = ({
  availableCash,
  onDeposit,
  onBuy,
  onSell,
  onWithdraw,
}) => {
  const [selectedAction, setSelectedAction] = useState<ActionType>(ActionType.Deposit);
  const [amount, setAmount] = useState<string>('');
  const [symbol, setSymbol] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const isStockAction =
    selectedAction === ActionType.Buy || selectedAction === ActionType.Sell;

  const computedStockTotal =
    isStockAction && !Number.isNaN(parseFloat(quantity)) && !Number.isNaN(parseFloat(price))
      ? parseFloat(quantity) * parseFloat(price)
      : 0;

  const resetInputs = () => {
    setAmount('');
    setQuantity('');
    setPrice('');
  };

  const handleSubmit = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setSubmitting(true);

    try {
      if (selectedAction === ActionType.Deposit) {
        const val = parseFloat(amount);
        const res = await onDeposit(val);
        setStatusMessage(
          `✅ Deposited $${res.cashLot.original_amount.toFixed(
            2
          )}. Created Original Capital Cash Lot #${res.cashLot.id}.`
        );
        resetInputs();
      } else if (selectedAction === ActionType.Buy) {
        const qty = parseFloat(quantity);
        const prc = parseFloat(price);
        const res = await onBuy(symbol, qty, prc);
        setStatusMessage(
          `✅ Bought ${res.transaction.amount} ${res.transaction.symbol} @ $${res.transaction.price.toFixed(
            2
          )} ($${res.transaction.total_value.toFixed(
            2
          )}). Consumed ${res.consumedCashLots.length} FIFO Cash Lot(s) ($${res.capitalUsed.toFixed(
            2
          )} Capital, $${res.profitReinvested.toFixed(2)} Profit).`
        );
        resetInputs();
      } else if (selectedAction === ActionType.Sell) {
        const qty = parseFloat(quantity);
        const prc = parseFloat(price);
        const res = await onSell(symbol, qty, prc);
        const capCreated = res.recoveredCapitalLot
          ? `$${res.recoveredCapitalLot.original_amount.toFixed(2)} Recovered Capital (Lot #${
              res.recoveredCapitalLot.id
            })`
          : '$0.00 Capital';
        const profCreated = res.realizedProfitLot
          ? `$${res.realizedProfitLot.original_amount.toFixed(2)} Realized Profit (Lot #${
              res.realizedProfitLot.id
            })`
          : '$0.00 Profit';
        setStatusMessage(
          `✅ Sold ${res.transaction.amount} ${res.transaction.symbol} @ $${res.transaction.price.toFixed(
            2
          )} (Realized P&L: $${res.realizedPnL.toFixed(
            2
          )}). Created Cash Lots: ${capCreated} + ${profCreated}.`
        );
        resetInputs();
      } else if (selectedAction === ActionType.Withdraw) {
        const val = parseFloat(amount);
        const res = await onWithdraw(val);
        setStatusMessage(
          `✅ Withdrew $${res.breakdown.requestedAmount.toFixed(
            2
          )} via FIFO: $${res.breakdown.fromOriginalCapital.toFixed(
            2
          )} from Original Capital (Tax-Free) + $${res.breakdown.fromRealizedProfit.toFixed(
            2
          )} from Realized Profit (Taxable).`
        );
        resetInputs();
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Transaction failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.headerTitle}>Quick Entry</Text>
      <Text style={styles.headerSubtitle}>
        Select an action below. Every dollar and share is automatically matched via strict
        FIFO lot accounting.
      </Text>

      {/* 4 Main Big Action Buttons */}
      <View style={styles.grid}>
        {ACTION_CARDS.map((item) => {
          const isSelected = selectedAction === item.type;
          return (
            <TouchableOpacity
              key={item.type}
              style={[
                styles.bigButton,
                isSelected && {
                  borderColor: item.accent,
                  backgroundColor: '#1E293B',
                },
              ]}
              onPress={() => {
                setSelectedAction(item.type);
                setErrorMessage(null);
                setStatusMessage(null);
              }}
            >
              <Text style={styles.bigButtonIcon}>{item.icon}</Text>
              <Text style={[styles.bigButtonLabel, isSelected && { color: item.accent }]}>
                {item.label}
              </Text>
              <Text style={styles.bigButtonHint}>{item.hint}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Dynamic Form Card */}
      <View style={styles.formCard}>
        <View style={styles.formHeaderRow}>
          <Text style={styles.formTitle}>{selectedAction} Details</Text>
          <Text style={styles.cashBalanceTag}>
            Available Cash: ${availableCash.toFixed(2)}
          </Text>
        </View>

        {isStockAction ? (
          <>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Stock Symbol (Ticker)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. AAPL, NVDA, TSLA"
                placeholderTextColor="#64748B"
                autoCapitalize="characters"
                value={symbol}
                onChangeText={setSymbol}
              />
            </View>

            <View style={styles.twoColRow}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>Quantity (Shares)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 10"
                  placeholderTextColor="#64748B"
                  keyboardType="decimal-pad"
                  value={quantity}
                  onChangeText={setQuantity}
                />
              </View>

              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>Price per Share ($)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 150.00"
                  placeholderTextColor="#64748B"
                  keyboardType="decimal-pad"
                  value={price}
                  onChangeText={setPrice}
                />
              </View>
            </View>

            <View style={styles.totalPreviewRow}>
              <Text style={styles.totalPreviewLabel}>Total Transaction Value:</Text>
              <Text style={styles.totalPreviewValue}>
                ${computedStockTotal.toFixed(2)}
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{selectedAction} Amount ($)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 1000.00"
              placeholderTextColor="#64748B"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />
          </View>
        )}

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>⚠️ {errorMessage}</Text>
          </View>
        ) : null}

        {statusMessage ? (
          <View style={styles.receiptBanner}>
            <Text style={styles.receiptBannerText}>{statusMessage}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.submitButton, submitting && { opacity: 0.6 }]}
          disabled={submitting}
          onPress={handleSubmit}
        >
          <Text style={styles.submitButtonText}>
            {submitting ? 'Processing FIFO Lots...' : `Confirm ${selectedAction}`}
          </Text>
        </TouchableOpacity>
      </View>
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
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 19,
    marginBottom: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  bigButton: {
    width: '48%',
    backgroundColor: '#162032',
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: '#334155',
    alignItems: 'flex-start',
  },
  bigButtonIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  bigButtonLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  bigButtonHint: {
    fontSize: 11,
    color: '#94A3B8',
  },
  formCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  formHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  cashBalanceTag: {
    fontSize: 12,
    fontWeight: '600',
    color: '#38BDF8',
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#F8FAFC',
    fontWeight: '600',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 12,
  },
  totalPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  totalPreviewLabel: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  totalPreviewValue: {
    fontSize: 16,
    color: '#F8FAFC',
    fontWeight: '800',
  },
  errorBanner: {
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F87171',
  },
  errorBannerText: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '600',
  },
  receiptBanner: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#34D399',
  },
  receiptBannerText: {
    color: '#A7F3D0',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  submitButton: {
    backgroundColor: '#38BDF8',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },
});

