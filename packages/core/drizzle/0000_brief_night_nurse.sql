CREATE TABLE `emails` (
	`message_id` text PRIMARY KEY NOT NULL,
	`received_at` integer NOT NULL,
	`from` text NOT NULL,
	`to_alias` text,
	`subject` text NOT NULL,
	`kind` text NOT NULL,
	`item_id` text,
	`match_method` text,
	`links` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `emails_item_idx` ON `emails` (`item_id`);--> statement-breakpoint
CREATE TABLE `field_mappings` (
	`domain` text NOT NULL,
	`form_signature` text NOT NULL,
	`mapping` text NOT NULL,
	`source` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`domain`, `form_signature`)
);
--> statement-breakpoint
CREATE TABLE `item_events` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`actor` text NOT NULL,
	`message` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `item_events_item_idx` ON `item_events` (`item_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`domain` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`status_reason` text,
	`why` text,
	`details` text DEFAULT '{}' NOT NULL,
	`deadline` text,
	`signup_alias` text,
	`run_id` text,
	`notes` text,
	`first_seen_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`status_changed_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `items_status_idx` ON `items` (`status`);--> statement-breakpoint
CREATE INDEX `items_kind_idx` ON `items` (`kind`);--> statement-breakpoint
CREATE TABLE `prefill_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`outcome` text,
	`stop_reason` text,
	`final_url` text,
	`storage_state_path` text,
	`screenshot_path` text,
	`fill_plan` text,
	`unfilled_required` text,
	`error` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `prefill_attempts_item_idx` ON `prefill_attempts` (`item_id`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`model` text NOT NULL,
	`headline` text,
	`candidate_counts` text,
	`usage` text,
	`error` text,
	`ingested_at` integer NOT NULL
);
