CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "categories_color_check" CHECK("categories"."color" IN ('blue', 'green', 'rose', 'amber', 'violet', 'teal', 'cyan', 'coral', 'olive', 'brown', 'slate', 'navy', 'magenta'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_active_name_unique` ON `categories` (lower("name")) WHERE "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `event_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`relative_path` text NOT NULL,
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
	CONSTRAINT "event_attachments_width_check" CHECK("event_attachments"."width" IS NULL OR "event_attachments"."width" >= 0),
	CONSTRAINT "event_attachments_height_check" CHECK("event_attachments"."height" IS NULL OR "event_attachments"."height" >= 0),
	CONSTRAINT "event_attachments_file_size_check" CHECK("event_attachments"."file_size" IS NULL OR "event_attachments"."file_size" >= 0),
	CONSTRAINT "event_attachments_sort_order_check" CHECK("event_attachments"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE INDEX `event_attachments_event_order_idx` ON `event_attachments` (`event_id`,`deleted_at`,`sort_order`,`id`);--> statement-breakpoint
CREATE TABLE `event_people` (
	`event_id` text NOT NULL,
	`person_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`event_id`, `person_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `event_people_person_idx` ON `event_people` (`person_id`,`deleted_at`,`event_id`);--> statement-breakpoint
CREATE TABLE `event_tags` (
	`event_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`event_id`, `tag_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `event_tags_tag_idx` ON `event_tags` (`tag_id`,`deleted_at`,`event_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`significance` text NOT NULL,
	`category_id` text,
	`location_id` text,
	`notes` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "events_title_length_check" CHECK(length("events"."title") <= 100),
	CONSTRAINT "events_significance_check" CHECK("events"."significance" IN ('ordinary', 'notable', 'major', 'turning-point'))
);
--> statement-breakpoint
CREATE INDEX `events_timeline_idx` ON `events` (`deleted_at`,`date`,`time`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `events_category_idx` ON `events` (`category_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `events_location_idx` ON `events` (`location_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `locations_active_name_unique` ON `locations` (lower("name")) WHERE "locations"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_active_name_unique` ON `people` (lower("name")) WHERE "people"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_active_name_unique` ON `tags` (lower("name")) WHERE "tags"."deleted_at" IS NULL;