CREATE TABLE `agent_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`progress_pct` integer DEFAULT 0 NOT NULL,
	`planned_start` text NOT NULL,
	`planned_end` text NOT NULL,
	`actual_start` text,
	`actual_end` text,
	`dependencies_json` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_tasks_session_idx` ON `agent_tasks` (`session_id`);--> statement-breakpoint
CREATE INDEX `agent_tasks_agent_idx` ON `agent_tasks` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_tasks_status_idx` ON `agent_tasks` (`status`);