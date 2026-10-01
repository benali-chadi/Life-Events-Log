CREATE TABLE `sync_conflicts` (
	`conflict_id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`field_name` text NOT NULL,
	`winning_device_id` text NOT NULL,
	`winning_sequence` integer NOT NULL,
	`losing_device_id` text NOT NULL,
	`losing_sequence` integer NOT NULL,
	`status` text NOT NULL,
	`resolution_device_id` text,
	`resolution_sequence` integer,
	CONSTRAINT "sync_conflicts_status_check" CHECK("sync_conflicts"."status" IN ('pending', 'resolved')),
	CONSTRAINT "sync_conflicts_resolution_check" CHECK(("sync_conflicts"."resolution_device_id" IS NULL AND "sync_conflicts"."resolution_sequence" IS NULL) OR ("sync_conflicts"."resolution_device_id" IS NOT NULL AND "sync_conflicts"."resolution_sequence" > 0 AND "sync_conflicts"."resolution_sequence" IS NOT NULL)),
	CONSTRAINT "sync_conflicts_sequences_check" CHECK("sync_conflicts"."winning_sequence" > 0 AND "sync_conflicts"."losing_sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE `sync_field_versions` (
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`field_name` text NOT NULL,
	`winner_device_id` text NOT NULL,
	`winner_sequence` integer NOT NULL,
	`winner_lamport` integer NOT NULL,
	PRIMARY KEY(`entity_type`, `entity_id`, `field_name`),
	CONSTRAINT "sync_field_versions_sequence_check" CHECK("sync_field_versions"."winner_sequence" > 0),
	CONSTRAINT "sync_field_versions_lamport_check" CHECK("sync_field_versions"."winner_lamport" > 0)
);
--> statement-breakpoint
CREATE TABLE `sync_frontiers` (
	`origin_device_id` text PRIMARY KEY NOT NULL,
	`processed_sequence` integer NOT NULL,
	CONSTRAINT "sync_frontiers_sequence_check" CHECK("sync_frontiers"."processed_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE `sync_local_state` (
	`device_id` text PRIMARY KEY NOT NULL,
	`observed_lamport` integer NOT NULL,
	CONSTRAINT "sync_local_state_lamport_check" CHECK("sync_local_state"."observed_lamport" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_local_state_singleton` ON `sync_local_state` ((1));--> statement-breakpoint
CREATE TABLE `sync_operations` (
	`origin_device_id` text NOT NULL,
	`origin_sequence` integer NOT NULL,
	`lamport` integer NOT NULL,
	`causal_context` text NOT NULL,
	`operation_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`payload` text NOT NULL,
	`operation_hash` text NOT NULL,
	`received_at` text NOT NULL,
	`applied_at` text NOT NULL,
	PRIMARY KEY(`origin_device_id`, `origin_sequence`),
	CONSTRAINT "sync_operations_sequence_check" CHECK("sync_operations"."origin_sequence" > 0),
	CONSTRAINT "sync_operations_lamport_check" CHECK("sync_operations"."lamport" > 0)
);
