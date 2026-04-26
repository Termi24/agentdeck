ALTER TABLE `sessions` ADD `is_bridge` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- Backfill: existing rows where the root agent (parent_agent_id IS NULL)
-- was created with role='bridge'. Necessary because before this migration
-- isBridge was derived live from agents.role, but set_agent_identity could
-- overwrite that role and break detection. From now on the flag is the
-- source of truth.
UPDATE `sessions` SET `is_bridge` = 1
WHERE `id` IN (
  SELECT `session_id` FROM `agents`
  WHERE `parent_agent_id` IS NULL AND `role` = 'bridge'
);