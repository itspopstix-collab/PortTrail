import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AssetType } from '../types/models.ts';

interface LotBadgeProps {
  assetType: AssetType;
  isRealized: boolean;
  symbol?: string | null;
}

export const LotBadge: React.FC<LotBadgeProps> = ({
  assetType,
  isRealized,
  symbol,
}) => {
  if (assetType === AssetType.Stock) {
    return (
      <View style={[styles.badge, styles.stockBadge]}>
        <Text style={[styles.badgeText, styles.stockText]}>
          📈 STOCK ({symbol ?? 'N/A'}) • {isRealized ? 'PROFIT-FUNDED' : 'CAPITAL-FUNDED'}
        </Text>
      </View>
    );
  }

  if (isRealized) {
    return (
      <View style={[styles.badge, styles.profitBadge]}>
        <Text style={[styles.badgeText, styles.profitText]}>✨ REALIZED PROFIT LOT</Text>
      </View>
    );
  }

  return (
    <View style={[styles.badge, styles.capitalBadge]}>
      <Text style={[styles.badgeText, styles.capitalText]}>🛡️ ORIGINAL CAPITAL LOT</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  capitalBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  capitalText: {
    color: '#38BDF8',
  },
  profitBadge: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
  },
  profitText: {
    color: '#34D399',
  },
  stockBadge: {
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
  },
  stockText: {
    color: '#A78BFA',
  },
});

