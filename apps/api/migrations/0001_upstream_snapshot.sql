-- Last known good normalized payload per cache key, served (marked stale) when an upstream fails.
CREATE TABLE upstream_snapshot (
  key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  payload TEXT NOT NULL,
  fetched_at INTEGER NOT NULL, -- epoch ms
  expires_at INTEGER NOT NULL  -- epoch ms; rows past this are deleted by the cron cleanup
);
CREATE INDEX upstream_snapshot_expires ON upstream_snapshot (expires_at);
