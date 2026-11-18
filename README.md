# Port Trail 📈

**Port Trail** is a local-first, offline mobile trading journal and FIFO tax calculator for retail stock investors, built with **React Native (Expo)**, **TypeScript**, and **SQLite (`expo-sqlite`)**.

---

## 🎯 The Problem It Solves

When retail investors sell stocks and reinvest the proceeds into new positions, traditional brokerages blend the cash together into a single "buying power" balance. Over multiple trades, investors lose track of how much of their portfolio is **Original Capital** (their own deposited principal) versus **Realized Profits** (taxable gains).

**Port Trail** solves this by treating **every dollar and every share as an immutable FIFO (First In, First Out) Lot** stored locally in SQLite.

---

## 🧠 Core FIFO Lot-Matching Logic (The "Aha!" Moment)

Every action executes inside an atomic SQLite transaction and mutates `Tax_Lots` in strict chronological (`created_at ASC, id ASC`) FIFO order:

1. **📥 Deposit (`deposit`)**
   - Creates a `Cash` Lot with `is_realized = 0` (**Original Capital**) and `cost_basis = 1.0`.
   - Appends a `Deposit` entry to `Transactions`.

2. **🛒 Buy (`buyStock`)**
   - Queries active `Cash` Lots (`remaining_amount > 0`) ordered oldest-first (`created_at ASC, id ASC`).
   - Deducts `quantity * price` from the oldest Cash Lots.
   - Creates `Stock` Lot(s) for `symbol` with `cost_basis = price`, preserving whether the shares were funded by Original Capital (`is_realized = 0`) or Reinvested Profit (`is_realized = 1`).
   - Appends a `Buy` entry to `Transactions`.

3. **💰 Sell (`sellStock`)**
   - Queries active `Stock` Lots for `symbol` (`remaining_amount > 0`) ordered oldest-first (`created_at ASC, id ASC`).
   - Deducts the sold share quantity across the oldest matching Stock Lots and computes:
     $$\text{Realized P\&L} = (\text{Quantity} \times \text{Sell Price}) - \sum (\text{Matched Shares} \times \text{Lot Cost Basis})$$
   - Creates **two new Cash Lots** from the sale proceeds:
     1. **Recovered Original Capital Cash Lot** (`asset_type = 'Cash'`, `is_realized = 0`): returns the original principal back to the Capital bucket.
     2. **Realized Profit Cash Lot** (`asset_type = 'Cash'`, `is_realized = 1`): isolates the realized profit in its own FIFO Cash Lot.
   - Appends a `Sell` entry to `Transactions`.

4. **📤 Withdraw & Withdraw Simulation (`withdraw` / `simulateWithdraw`)**
   - Walks active `Cash` Lots in strict FIFO order (`created_at ASC, id ASC`).
   - Identifies every dollar withdrawn as either:
     - **Original Capital (`is_realized = 0`)** — Tax-Free return of principal.
     - **Realized Profit (`is_realized = 1`)** — Taxable capital gain withdrawal.
   - `simulateWithdraw` runs non-destructively so investors can preview tax implications on the Dashboard before executing a withdrawal.

---

## 🗄️ Local SQLite Database Schema

All data is stored offline on-device in `port_trail.db`:

### 1. `Portfolios`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Unique portfolio ID |
| `name` | `TEXT NOT NULL` | Portfolio name (e.g., `"Main Broker"`) |
| `currency` | `TEXT NOT NULL` | Base currency code (e.g., `"USD"`) |

### 2. `Transactions` (The Immutable Ledger)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Unique transaction ID |
| `portfolio_id` | `INTEGER NOT NULL (FK)` | References `Portfolios(id)` |
| `action_type` | `TEXT NOT NULL` | Enum: `'Deposit'`, `'Buy'`, `'Sell'`, `'Withdraw'` |
| `symbol` | `TEXT NULL` | Ticker symbol (nullable for cash actions) |
| `amount` | `REAL NOT NULL` | Cash amount or share quantity |
| `price` | `REAL NOT NULL` | `1.0` for cash actions, price per share for stock actions |
| `total_value` | `REAL NOT NULL` | Total dollar value (`amount * price`) |
| `created_at` | `TEXT NOT NULL` | ISO-8601 UTC timestamp |

### 3. `Tax_Lots` (The FIFO Engine)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Unique tax lot ID |
| `portfolio_id` | `INTEGER NOT NULL (FK)` | References `Portfolios(id)` |
| `asset_type` | `TEXT NOT NULL` | Enum: `'Cash'`, `'Stock'` |
| `symbol` | `TEXT NULL` | Stock ticker symbol (`NULL` for `'Cash'`) |
| `original_amount` | `REAL NOT NULL` | Initial dollars (for Cash) or shares (for Stock) |
| `remaining_amount` | `REAL NOT NULL` | Unconsumed dollars or shares remaining in the lot |
| `cost_basis` | `REAL NOT NULL` | Price per unit (`1.0` for Cash, buy price for Stock) |
| `is_realized` | `INTEGER (BOOLEAN) NOT NULL` | `0` = Original Capital lot, `1` = Realized Profit lot |
| `created_at` | `TEXT NOT NULL` | ISO-8601 UTC timestamp |

---

## 📁 Project Structure

```text
PortTrail/
├── App.tsx                           # Root app component & bottom tab navigation
├── app.json                          # Expo mobile app configuration
├── package.json                      # Dependencies & scripts
├── tsconfig.json                     # TypeScript configuration
├── src/
│   ├── types/
│   │   └── models.ts                 # TypeScript interfaces & Enums
│   ├── database/
│   │   ├── schema.ts                 # SQLite DDL scripts & FIFO composite indexes
│   │   └── DatabaseHelper.ts         # SQLite connection lifecycle & transaction wrapper
│   ├── services/
│   │   └── FifoAccountingEngine.ts   # Core FIFO engine (Deposit, Buy, Sell, Withdraw, Simulate)
│   ├── hooks/
│   │   └── usePortfolio.ts           # React state hook bridging UI and SQLite
│   ├── screens/
│   │   ├── DashboardScreen.tsx       # Portfolio Value, Capital vs. Profit, Withdraw Simulator, FIFO Queue
│   │   └── QuickEntryScreen.tsx      # 4 big action buttons (📥 Deposit, 🛒 Buy, 💰 Sell, 📤 Withdraw)
│   └── components/
│       ├── MetricCard.tsx            # Reusable metric display card
│       ├── LotBadge.tsx              # Visual badge for Capital vs. Profit vs. Stock lots
│       └── WithdrawSimulatorCard.tsx # Interactive pre-withdrawal FIFO tax simulator
└── tests/
    └── fifoEngine.test.ts            # End-to-end automated verification of FIFO accounting
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Automated FIFO SQLite Test Suite
You can verify the SQLite schema and FIFO accounting engine directly in Node.js (uses Node's built-in `node:sqlite`):
```bash
npm test
```

### 3. Start the Mobile App (Expo)
```bash
npx expo start
```
- Press **`i`** to open in the iOS Simulator.
- Press **`a`** to open in the Android Emulator.
- Or scan the QR code with the **Expo Go** app on your physical device.

---

## 📦 Initialize Git & Push to GitHub

```bash
git init
git add .
git commit -m "feat: initial commit of Port Trail FIFO trading journal and tax calculator"
git branch -M main
git remote add origin https://github.com/<your-username>/PortTrail.git
git push -u origin main
```

