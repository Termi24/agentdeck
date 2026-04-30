CREATE TABLE `campaign_gate_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` text NOT NULL,
	`gate_name` text NOT NULL,
	`value_json` text NOT NULL,
	`threshold_json` text NOT NULL,
	`passed` integer NOT NULL,
	`blocking` integer NOT NULL,
	`waived` integer DEFAULT false NOT NULL,
	`detail_json` text,
	`evaluated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campaign_gate_results_campaign_idx` ON `campaign_gate_results` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `campaign_gate_results_name_idx` ON `campaign_gate_results` (`gate_name`);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `target` text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `template_name` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `gate_results_json` text;--> statement-breakpoint
CREATE INDEX `campaigns_target_idx` ON `campaigns` (`target`);