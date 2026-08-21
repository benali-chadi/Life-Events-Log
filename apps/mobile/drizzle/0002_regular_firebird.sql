DROP INDEX `categories_active_name_unique`;--> statement-breakpoint
ALTER TABLE `categories` ADD `normalized_name` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `categories` SET `normalized_name` = lower(trim(`name`));--> statement-breakpoint
CREATE UNIQUE INDEX `categories_active_normalized_name_unique` ON `categories` (`normalized_name`) WHERE "categories"."deleted_at" IS NULL;--> statement-breakpoint
DROP INDEX `locations_active_name_unique`;--> statement-breakpoint
ALTER TABLE `locations` ADD `normalized_name` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `locations` SET `normalized_name` = lower(trim(`name`));--> statement-breakpoint
CREATE UNIQUE INDEX `locations_active_normalized_name_unique` ON `locations` (`normalized_name`) WHERE "locations"."deleted_at" IS NULL;--> statement-breakpoint
DROP INDEX `people_active_name_unique`;--> statement-breakpoint
ALTER TABLE `people` ADD `normalized_name` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `people` SET `normalized_name` = lower(trim(`name`));--> statement-breakpoint
CREATE UNIQUE INDEX `people_active_normalized_name_unique` ON `people` (`normalized_name`) WHERE "people"."deleted_at" IS NULL;--> statement-breakpoint
DROP INDEX `tags_active_name_unique`;--> statement-breakpoint
ALTER TABLE `tags` ADD `normalized_name` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `tags` SET `normalized_name` = lower(trim(`name`));--> statement-breakpoint
CREATE UNIQUE INDEX `tags_active_normalized_name_unique` ON `tags` (`normalized_name`) WHERE "tags"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `normalized_title` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `events` SET `normalized_title` = lower(trim(`title`));--> statement-breakpoint
CREATE INDEX `events_normalized_title_idx` ON `events` (`normalized_title`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `app_data_migrations` (
	`key` text PRIMARY KEY NOT NULL,
	`applied_at` text NOT NULL
);
