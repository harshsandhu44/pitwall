-- Snapshots no longer expire: keys upsert in place and the key space is bounded, so they are kept as a permanent fallback.
DROP INDEX upstream_snapshot_expires;
ALTER TABLE upstream_snapshot DROP COLUMN expires_at;
