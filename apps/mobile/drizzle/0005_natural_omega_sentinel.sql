PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_event_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text,
	`width` integer,
	`height` integer,
	`file_size` integer,
	`sort_order` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "event_attachments_width_check" CHECK("__new_event_attachments"."width" IS NULL OR "__new_event_attachments"."width" >= 0),
	CONSTRAINT "event_attachments_height_check" CHECK("__new_event_attachments"."height" IS NULL OR "__new_event_attachments"."height" >= 0),
	CONSTRAINT "event_attachments_file_size_check" CHECK("__new_event_attachments"."file_size" IS NULL OR "__new_event_attachments"."file_size" >= 0),
	CONSTRAINT "event_attachments_sort_order_check" CHECK("__new_event_attachments"."sort_order" >= 0),
	CONSTRAINT "event_attachments_content_hash_check" CHECK(length("__new_event_attachments"."content_hash") = 64 AND "__new_event_attachments"."content_hash" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
INSERT INTO `__new_event_attachments`("id", "event_id", "content_hash", "filename", "mime_type", "width", "height", "file_size", "sort_order", "created_at", "updated_at", "deleted_at") SELECT "id", "event_id", "content_hash", "filename", "mime_type", "width", "height", "file_size", "sort_order", "created_at", "updated_at", "deleted_at" FROM `event_attachments`;--> statement-breakpoint
DROP TABLE `event_attachments`;--> statement-breakpoint
ALTER TABLE `__new_event_attachments` RENAME TO `event_attachments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `event_attachments_event_order_idx` ON `event_attachments` (`event_id`,`deleted_at`,`sort_order`,`id`);