/**
 * SQLite Table Creation Scripts & Indexes for Port Trail.
 *
 * Enforces foreign keys, enum check constraints, and composite FIFO indexes
 * (`portfolio_id`, `asset_type`, `symbol`, `remaining_amount`, `created_at`, `id`).
 */

export const DATABASE_NAME = 'port_trail.db';

export const CREATE_PORTFOLIOS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS Portfolios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD'
);
`;

export const CREATE_TRANSACTIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS Transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id INTEGER NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('Deposit', 'Buy', 'Sell', 'Withdraw')),
  symbol TEXT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  price REAL NOT NULL CHECK (price >= 0),
  total_value REAL NOT NULL CHECK (total_value >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (portfolio_id) REFERENCES Portfolios (id) ON DELETE CASCADE
);
`;

export const CREATE_TAX_LOTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS Tax_Lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id INTEGER NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('Cash', 'Stock')),
  symbol TEXT NULL,
  original_amount REAL NOT NULL CHECK (original_amount > 0),
  remaining_amount REAL NOT NULL CHECK (remaining_amount >= 0),
  cost_basis REAL NOT NULL CHECK (cost_basis >= 0),
  is_realized INTEGER NOT NULL DEFAULT 0 CHECK (is_realized IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (portfolio_id) REFERENCES Portfolios (id) ON DELETE CASCADE
);
`;

export const CREATE_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_tax_lots_fifo_cash
  ON Tax_Lots (portfolio_id, asset_type, remaining_amount, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_tax_lots_fifo_stock
  ON Tax_Lots (portfolio_id, asset_type, symbol, remaining_amount, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_transactions_portfolio_date
  ON Transactions (portfolio_id, created_at DESC, id DESC);
`;

export const INITIAL_SCHEMA_SCRIPTS = [
  'PRAGMA foreign_keys = ON;',
  CREATE_PORTFOLIOS_TABLE_SQL,
  CREATE_TRANSACTIONS_TABLE_SQL,
  CREATE_TAX_LOTS_TABLE_SQL,
  CREATE_INDEXES_SQL,
];

