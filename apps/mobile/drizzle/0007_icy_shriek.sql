CREATE TABLE `sync_pending_operations` (
	`operation_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`entity_id`, `entity_type`, `operation_type`)
);
