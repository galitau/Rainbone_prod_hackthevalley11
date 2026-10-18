-- Add tool provenance without question text, arguments or tool output.
-- Existing rows remain empty; existing endpoints need no schema-dependent insert change.
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS tools_used jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(tools_used) = 'array' AND jsonb_array_length(tools_used) <= 4);
