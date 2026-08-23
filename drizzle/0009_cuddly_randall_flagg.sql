CREATE TABLE `approval_delegations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`approval_stage` enum('accountant','reviewer','cfo','gm','auditor') NOT NULL,
	`delegateUserId` int NOT NULL,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`reason` text NOT NULL,
	`createdBy` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `approval_delegations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `approval_policies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`companyId` int,
	`minAmount` decimal(18,4),
	`maxAmount` decimal(18,4),
	`stages` json NOT NULL,
	`allowSkip` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `approval_policies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `request_approval_routes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`policyId` int,
	`stagesSnapshot` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `request_approval_routes_id` PRIMARY KEY(`id`),
	CONSTRAINT `request_approval_routes_requestId_unique` UNIQUE(`requestId`),
	CONSTRAINT `request_approval_routes_request_idx` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE INDEX `approval_delegations_role_idx` ON `approval_delegations` (`approval_stage`);--> statement-breakpoint
CREATE INDEX `approval_delegations_date_idx` ON `approval_delegations` (`startsAt`,`endsAt`);--> statement-breakpoint
CREATE INDEX `approval_policies_company_idx` ON `approval_policies` (`companyId`);--> statement-breakpoint
CREATE INDEX `approval_policies_active_idx` ON `approval_policies` (`isActive`);