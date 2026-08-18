CREATE TABLE `exchange_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`baseCurrency` varchar(8) NOT NULL,
	`quoteCurrency` varchar(8) NOT NULL,
	`rate` decimal(24,10) NOT NULL,
	`effectiveAt` timestamp NOT NULL,
	`source` varchar(120),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exchange_rates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `exchange_rates_pair_idx` ON `exchange_rates` (`baseCurrency`,`quoteCurrency`);--> statement-breakpoint
CREATE INDEX `exchange_rates_effective_idx` ON `exchange_rates` (`effectiveAt`);