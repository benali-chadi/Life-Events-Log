DROP INDEX `categories_active_normalized_name_unique`;--> statement-breakpoint
CREATE INDEX `categories_active_normalized_name_idx` ON `categories` (`normalized_name`) WHERE "categories"."deleted_at" IS NULL;--> statement-breakpoint
DROP INDEX `locations_active_normalized_name_unique`;--> statement-breakpoint
CREATE INDEX `locations_active_normalized_name_idx` ON `locations` (`normalized_name`) WHERE "locations"."deleted_at" IS NULL;--> statement-breakpoint
DROP INDEX `people_active_normalized_name_unique`;--> statement-breakpoint
CREATE INDEX `people_active_normalized_name_idx` ON `people` (`normalized_name`) WHERE "people"."deleted_at" IS NULL;--> statement-breakpoint
DROP INDEX `tags_active_normalized_name_unique`;--> statement-breakpoint
CREATE INDEX `tags_active_normalized_name_idx` ON `tags` (`normalized_name`) WHERE "tags"."deleted_at" IS NULL;