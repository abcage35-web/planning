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

INSERT OR IGNORE INTO users (login, password_hash, role, is_active, created_at)
VALUES
  ('user', 'pbkdf2_sha256$210000$Xyk2VrY4qRGg4fnlg2fBCw==$8P22oGccoWWA7nyD2nujjFuuToxvWwpwO3o6kwe1nB8=', 'user', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('admin', 'pbkdf2_sha256$210000$akVRZ3qknVvEJ0HIbtvqhg==$GpxkvT/Wb9m4nGTFBw4wxkEc+rw9gTFHMEyqxh3nFPw=', 'admin', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE IF NOT EXISTS dashboard_state (
  state_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_state_updated_at
  ON dashboard_state(updated_at);
