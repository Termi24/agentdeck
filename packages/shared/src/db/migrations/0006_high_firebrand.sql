CREATE TABLE `agent_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`severity` text NOT NULL,
	`stuck_minutes` integer NOT NULL,
	`snapshot` text NOT NULL,
	`action_taken` text NOT NULL,
	`incident_doc_path` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_incidents_session_idx` ON `agent_incidents` (`session_id`);--> statement-breakpoint
CREATE INDEX `agent_incidents_agent_idx` ON `agent_incidents` (`agent_id`);--> statement-breakpoint
CREATE TABLE `internal_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`severity` text NOT NULL,
	`source` text NOT NULL,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`stack` text,
	`context` text,
	`occurrences` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`fixed_in_version` text,
	`first_seen_at` text DEFAULT (current_timestamp) NOT NULL,
	`last_seen_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `internal_findings_fingerprint_idx` ON `internal_findings` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `internal_findings_status_idx` ON `internal_findings` (`status`);--> statement-breakpoint
CREATE INDEX `internal_findings_severity_idx` ON `internal_findings` (`severity`);--> statement-breakpoint
CREATE INDEX `internal_findings_last_seen_idx` ON `internal_findings` (`last_seen_at`);