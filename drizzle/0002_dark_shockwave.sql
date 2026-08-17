ALTER TABLE `workflow_events` ADD `workflow_from_status` enum('draft','review','approved','executed','rejected');--> statement-breakpoint
ALTER TABLE `workflow_events` ADD `workflow_to_status` enum('draft','review','approved','executed','rejected') NOT NULL;--> statement-breakpoint
ALTER TABLE `workflow_events` DROP COLUMN `disbursement_status`;