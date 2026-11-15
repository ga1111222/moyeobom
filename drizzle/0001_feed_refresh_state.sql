CREATE TABLE feed_refresh_state (
 key TEXT PRIMARY KEY,
 value_json TEXT,
 retry_at INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL DEFAULT 0
);
