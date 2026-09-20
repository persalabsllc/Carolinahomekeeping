CREATE TABLE IF NOT EXISTS schedule_blocks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 label text NOT NULL DEFAULT 'Unavailable', active boolean NOT NULL DEFAULT true,
 source_slot_id uuid UNIQUE REFERENCES appointment_slots(id), created_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS schedule_blocks_range ON schedule_blocks(starts_at,ends_at) WHERE active;
CREATE INDEX IF NOT EXISTS appointment_slots_range ON appointment_slots(starts_at,ends_at);
-- Preserve deliberate blocks from the previous arrival-window scheduler.
INSERT INTO schedule_blocks(starts_at,ends_at,label,source_slot_id)
 SELECT starts_at,ends_at,coalesce(nullif(label,''),'Unavailable'),id FROM appointment_slots WHERE blocked=true
 ON CONFLICT(source_slot_id) DO NOTHING;
