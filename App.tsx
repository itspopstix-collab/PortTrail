import React, { useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePortfolio } from './src/hooks/usePortfolio.ts';
import { DashboardScreen } from './src/screens/DashboardScreen.tsx';
import { QuickEntryScreen } from './src/screens/QuickEntryScreen.tsx';

type ActiveTab = 'Dashboard' | 'QuickEntry';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('Dashboard');
  const {
    loading,
    error,
    metrics,
    activeLots,
    transactions,
    deposit,
    buyStock,
    sellStock,
    withdraw,
    simulateWithdraw,
  } = usePortfolio();

  if (loading || !metrics) {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={styles.loadingText}>Initializing Local SQLite FIFO Engine...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.errorText}>Database Error: {error}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Top App Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brandTitle}>Port Trail</Text>
          <Text style={styles.brandSubtitle}>
            Local-First FIFO Trading Journal & Tax Calculator
          </Text>
        </View>
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineBadgeText}>● OFFLINE SQLITE</Text>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.body}>
        {activeTab === 'Dashboard' ? (
          <DashboardScreen
            metrics={metrics}
            activeLots={activeLots}
            transactions={transactions}
            onSimulateWithdraw={simulateWithdraw}
            onNavigateQuickEntry={() => setActiveTab('QuickEntry')}
          />
        ) : (
          <QuickEntryScreen
            availableCash={metrics.totalCashBalance}
            onDeposit={deposit}
            onBuy={buyStock}
            onSell={sellStock}
            onWithdraw={(amount) => withdraw(amount, 15)}
          />
        )}
      </View>

      {/* Bottom Tab Navigation */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'Dashboard' && styles.tabItemActive,
          ]}
          onPress={() => setActiveTab('Dashboard')}
        >
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'Dashboard' && styles.tabLabelActive,
            ]}
          >
            📊 Dashboard
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'QuickEntry' && styles.tabItemActive,
          ]}
          onPress={() => setActiveTab('QuickEntry')}
        >
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'QuickEntry' && styles.tabLabelActive,
            ]}
          >
            ⚡ Quick Entry
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  centered: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: '#F87171',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  offlineBadge: {
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.3)',
  },
  offlineBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#34D399',
  },
  body: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 12,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
  },
  tabLabelActive: {
    color: '#38BDF8',
  },
});

