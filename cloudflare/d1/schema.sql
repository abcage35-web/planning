CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_role
  ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
  ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
  ON sessions(expires_at);

INSERT INTO users (login, password_hash, role, is_active, created_at)
VALUES
  ('user', 'pbkdf2_sha256$210000$Xyk2VrY4qRGg4fnlg2fBCw==$8P22oGccoWWA7nyD2nujjFuuToxvWwpwO3o6kwe1nB8=', 'user', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('admin', 'pbkdf2_sha256$210000$akVRZ3qknVvEJ0HIbtvqhg==$GpxkvT/Wb9m4nGTFBw4wxkEc+rw9gTFHMEyqxh3nFPw=', 'admin', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(login) DO UPDATE SET
  password_hash = excluded.password_hash,
  role = excluded.role,
  is_active = excluded.is_active;

CREATE TABLE IF NOT EXISTS dashboard_state (
  state_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_state_updated_at
  ON dashboard_state(updated_at);

CREATE TABLE IF NOT EXISTS dashboard_state_meta (
  state_key TEXT PRIMARY KEY,
  meta_json TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  actor_user_id INTEGER,
  actor_login TEXT,
  actor_role TEXT,
  actor_ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_dashboard_state_meta_updated_at
  ON dashboard_state_meta(updated_at);

CREATE TABLE IF NOT EXISTS dashboard_rows_current (
  state_key TEXT NOT NULL,
  row_id TEXT NOT NULL,
  sort_index INTEGER NOT NULL DEFAULT 0,
  nm_id TEXT NOT NULL,
  cabinet TEXT,
  supplier_id TEXT,
  stock_value INTEGER,
  in_stock INTEGER,
  stock_source TEXT,
  current_price INTEGER,
  base_price INTEGER,
  price_source TEXT,
  error TEXT,
  updated_at TEXT,
  card_code TEXT,
  product_name TEXT,
  category_name TEXT,
  brand_name TEXT,
  has_video INTEGER,
  has_recommendations INTEGER,
  has_rich INTEGER,
  rich_block_count INTEGER,
  has_autoplay INTEGER,
  has_tags INTEGER,
  cover_duplicate INTEGER,
  listing_slides_count INTEGER,
  rich_slides_count INTEGER,
  recommendation_known_count INTEGER,
  recommendation_refs_json TEXT,
  color_count INTEGER,
  color_nm_ids_json TEXT,
  rating REAL,
  review_count INTEGER,
  market_error TEXT,
  row_data_json TEXT,
  row_payload_json TEXT,
  row_hash TEXT NOT NULL,
  last_saved_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  saved_by_user_id INTEGER,
  saved_by_login TEXT,
  saved_by_role TEXT,
  saved_by_ip TEXT,
  PRIMARY KEY(state_key, row_id)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_rows_current_nm
  ON dashboard_rows_current(state_key, nm_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_rows_current_updated
  ON dashboard_rows_current(state_key, updated_at);

CREATE INDEX IF NOT EXISTS idx_dashboard_rows_current_cabinet
  ON dashboard_rows_current(state_key, cabinet);

CREATE TABLE IF NOT EXISTS dashboard_row_versions (
  version_id INTEGER PRIMARY KEY AUTOINCREMENT,
  state_key TEXT NOT NULL,
  row_id TEXT NOT NULL,
  nm_id TEXT NOT NULL,
  sort_index INTEGER NOT NULL DEFAULT 0,
  operation TEXT NOT NULL CHECK(operation IN ('upsert', 'delete', 'rollback')),
  version_saved_at TEXT NOT NULL,
  actor_user_id INTEGER,
  actor_login TEXT,
  actor_role TEXT,
  actor_ip TEXT,
  cabinet TEXT,
  supplier_id TEXT,
  stock_value INTEGER,
  in_stock INTEGER,
  stock_source TEXT,
  current_price INTEGER,
  base_price INTEGER,
  price_source TEXT,
  error TEXT,
  updated_at TEXT,
  card_code TEXT,
  product_name TEXT,
  category_name TEXT,
  brand_name TEXT,
  has_video INTEGER,
  has_recommendations INTEGER,
  has_rich INTEGER,
  rich_block_count INTEGER,
  has_autoplay INTEGER,
  has_tags INTEGER,
  cover_duplicate INTEGER,
  listing_slides_count INTEGER,
  rich_slides_count INTEGER,
  recommendation_known_count INTEGER,
  recommendation_refs_json TEXT,
  color_count INTEGER,
  color_nm_ids_json TEXT,
  rating REAL,
  review_count INTEGER,
  market_error TEXT,
  row_data_json TEXT,
  row_payload_json TEXT,
  row_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_row_versions_row
  ON dashboard_row_versions(state_key, row_id, version_saved_at);

CREATE INDEX IF NOT EXISTS idx_dashboard_row_versions_nm
  ON dashboard_row_versions(state_key, nm_id);

CREATE TABLE IF NOT EXISTS dashboard_row_logs (
  state_key TEXT NOT NULL,
  row_id TEXT NOT NULL,
  log_id TEXT NOT NULL,
  at TEXT NOT NULL,
  source TEXT,
  mode TEXT,
  action_key TEXT,
  status TEXT,
  error TEXT,
  changes_json TEXT,
  actor_user_id INTEGER,
  actor_login TEXT,
  actor_role TEXT,
  actor_ip TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(state_key, row_id, log_id)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_row_logs_at
  ON dashboard_row_logs(state_key, row_id, at);

CREATE TABLE IF NOT EXISTS dashboard_problem_snapshots (
  state_key TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  at TEXT NOT NULL,
  source TEXT,
  action_key TEXT,
  mode TEXT,
  total_rows INTEGER,
  loaded_rows INTEGER,
  error_rows INTEGER,
  problems_json TEXT,
  cabinets_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(state_key, snapshot_id)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_problem_snapshots_at
  ON dashboard_problem_snapshots(state_key, at);

CREATE TABLE IF NOT EXISTS dashboard_save_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  state_key TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  rows_total INTEGER NOT NULL DEFAULT 0,
  rows_changed INTEGER NOT NULL DEFAULT 0,
  rows_deleted INTEGER NOT NULL DEFAULT 0,
  logs_upserted INTEGER NOT NULL DEFAULT 0,
  payload_size INTEGER NOT NULL DEFAULT 0,
  actor_user_id INTEGER,
  actor_login TEXT,
  actor_role TEXT,
  actor_ip TEXT,
  source TEXT,
  action_key TEXT,
  mode TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_save_events_saved_at
  ON dashboard_save_events(state_key, saved_at);
