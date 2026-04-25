CREATE TABLE `agent_cancel_requests` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`requested_at` text DEFAULT (current_timestamp) NOT NULL,
	`requested_by_agent_id` text
);
--> statement-breakpoint
CREATE TABLE `browser_screenshots` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`agent_id` text,
	`url` text,
	`image_path` text NOT NULL,
	`caption` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `browser_screenshots_session_idx` ON `browser_screenshots` (`session_id`);--> statement-breakpoint
CREATE TABLE `direct_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`from_agent_id` text NOT NULL,
	`from_agent_name` text NOT NULL,
	`to_agent_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dm_session_to_idx` ON `direct_messages` (`session_id`,`to_agent_id`);--> statement-breakpoint
CREATE TABLE `exec_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`agent_id` text,
	`command` text NOT NULL,
	`stdout` text DEFAULT '' NOT NULL,
	`stderr` text DEFAULT '' NOT NULL,
	`exit_code` integer,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`timed_out` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exec_runs_session_idx` ON `exec_runs` (`session_id`);--> statement-breakpoint
CREATE TABLE `project_memory` (
	`project_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_by_agent_id` text,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `project_memory_pk` ON `project_memory` (`project_id`,`key`);--> statement-breakpoint
CREATE TABLE `secrets` (
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`value_encrypted` text NOT NULL,
	`iv` text NOT NULL,
	`tag` text NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `secrets_pk` ON `secrets` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `test_results` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`suite` text NOT NULL,
	`case_name` text NOT NULL,
	`status` text NOT NULL,
	`evidence` text,
	`message` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `test_results_session_idx` ON `test_results` (`session_id`);--> statement-breakpoint
CREATE INDEX `test_results_suite_idx` ON `test_results` (`suite`);--> statement-breakpoint
CREATE TABLE `user_inputs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`content` text NOT NULL,
	`consumed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_inputs_session_idx` ON `user_inputs` (`session_id`);