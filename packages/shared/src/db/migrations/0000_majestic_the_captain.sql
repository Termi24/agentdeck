CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`parent_agent_id` text,
	`name` text NOT NULL,
	`role` text,
	`model` text,
	`prompt` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`started_at` text DEFAULT (current_timestamp) NOT NULL,
	`ended_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agents_session_idx` ON `agents` (`session_id`);--> statement-breakpoint
CREATE INDEX `agents_parent_idx` ON `agents` (`parent_agent_id`);--> statement-breakpoint
CREATE TABLE `channel_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`from_agent_id` text NOT NULL,
	`from_agent_name` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `channel_messages_session_idx` ON `channel_messages` (`session_id`);--> statement-breakpoint
CREATE TABLE `docs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`path` text NOT NULL,
	`content` text NOT NULL,
	`updated_by_agent_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `docs_session_path_idx` ON `docs` (`session_id`,`path`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`agent_id` text,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_session_seq_idx` ON `events` (`session_id`,`seq`);--> statement-breakpoint
CREATE INDEX `events_agent_idx` ON `events` (`agent_id`);--> statement-breakpoint
CREATE INDEX `events_type_idx` ON `events` (`type`);--> statement-breakpoint
CREATE TABLE `procedures` (
	`name` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`description` text,
	`format` text NOT NULL,
	`content` text NOT NULL,
	`hash` text NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`root_prompt` text NOT NULL,
	`workspace_path` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_tokens_in` integer DEFAULT 0 NOT NULL,
	`total_tokens_out` integer DEFAULT 0 NOT NULL,
	`started_at` text DEFAULT (current_timestamp) NOT NULL,
	`ended_at` text
);
--> statement-breakpoint
CREATE TABLE `tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`input` text NOT NULL,
	`output` text,
	`is_error` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` text DEFAULT (current_timestamp) NOT NULL,
	`ended_at` text,
	`duration_ms` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tool_calls_agent_idx` ON `tool_calls` (`agent_id`);