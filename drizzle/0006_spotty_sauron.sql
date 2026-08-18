ALTER TABLE `exchange_rates` ADD `exchange_rate_approval_status` enum('approved','voided') DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE `exchange_rates` ADD `approvedBy` int;--> statement-breakpoint
ALTER TABLE `exchange_rates` ADD `approvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `exchange_rates` ADD `approvalNote` text;