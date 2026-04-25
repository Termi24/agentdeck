CREATE TABLE `campaign_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`value_json` text NOT NULL,
	`tags_json` text,
	`recorded_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campaign_metrics_campaign_idx` ON `campaign_metrics` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `campaign_metrics_name_idx` ON `campaign_metrics` (`name`);--> statement-breakpoint
CREATE TABLE `campaign_retrospectives` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`what_went_well` text NOT NULL,
	`what_went_badly` text NOT NULL,
	`key_learnings` text NOT NULL,
	`tooling_feedback` text NOT NULL,
	`recommendations` text NOT NULL,
	`submitted_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`project_name` text NOT NULL,
	`cli_source` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` text DEFAULT (current_timestamp) NOT NULL,
	`ended_at` text
);
--> statement-breakpoint
CREATE INDEX `campaigns_status_idx` ON `campaigns` (`status`);