CREATE TABLE `overdue_alert_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`isEnabled` boolean NOT NULL DEFAULT true,
	`cronExpression` varchar(64) NOT NULL DEFAULT '0 0 6 * * *',
	`scheduleCronTaskUid` varchar(65),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `overdue_alert_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `overdue_alert_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alertConfigId` int NOT NULL,
	`deliveryDate` varchar(10) NOT NULL,
	`overdue_alert_delivery_status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
	`requestCount` int NOT NULL DEFAULT 0,
	`content` text,
	`lastError` text,
	`attempts` int NOT NULL DEFAULT 0,
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `overdue_alert_deliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `overdue_alert_deliveries_config_date_idx` UNIQUE(`alertConfigId`,`deliveryDate`)
);
--> statement-breakpoint
CREATE INDEX `overdue_alert_configs_task_uid_idx` ON `overdue_alert_configs` (`scheduleCronTaskUid`);