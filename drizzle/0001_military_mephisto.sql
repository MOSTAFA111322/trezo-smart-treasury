CREATE TABLE `attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`fileName` varchar(240) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`sizeBytes` int NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`uploadedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int NOT NULL,
	`action` varchar(80) NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`entityId` varchar(80),
	`beforeData` json,
	`afterData` json,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `banks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`swiftCode` varchar(40),
	`country` varchar(80),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `banks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `beneficiaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`type` enum('individual','organization') NOT NULL DEFAULT 'organization',
	`taxNumber` varchar(80),
	`phone` varchar(40),
	`email` varchar(320),
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `beneficiaries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `beneficiary_bank_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`beneficiaryId` int NOT NULL,
	`bankId` int NOT NULL,
	`accountName` varchar(180) NOT NULL,
	`iban` varchar(64) NOT NULL,
	`currency` varchar(8) NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `beneficiary_bank_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`legalName` varchar(220),
	`registrationNumber` varchar(80),
	`defaultCurrency` varchar(8) NOT NULL DEFAULT 'SAR',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `companies_name_idx` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `currencies` (
	`code` varchar(8) NOT NULL,
	`nameAr` varchar(80) NOT NULL,
	`nameEn` varchar(80) NOT NULL,
	`symbol` varchar(12) NOT NULL,
	`decimals` int NOT NULL DEFAULT 2,
	`isActive` boolean NOT NULL DEFAULT true,
	CONSTRAINT `currencies_code` PRIMARY KEY(`code`)
);
--> statement-breakpoint
CREATE TABLE `disbursement_channels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`code` varchar(32) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `disbursement_channels_id` PRIMARY KEY(`id`),
	CONSTRAINT `disbursement_channels_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `disbursement_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referenceNumber` varchar(48) NOT NULL,
	`companyId` int NOT NULL,
	`beneficiaryId` int NOT NULL,
	`bankAccountId` int,
	`channelId` int NOT NULL,
	`fiscalYearId` int NOT NULL,
	`title` varchar(240) NOT NULL,
	`description` text,
	`amount` decimal(18,4) NOT NULL,
	`currency` varchar(8) NOT NULL,
	`amountInWords` text NOT NULL,
	`scheduledFor` timestamp,
	`disbursement_status` enum('draft','review','approved','executed','rejected') NOT NULL DEFAULT 'draft',
	`rejectionReason` text,
	`createdBy` int NOT NULL,
	`submittedAt` timestamp,
	`approvedAt` timestamp,
	`executedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `disbursement_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `disbursement_requests_referenceNumber_unique` UNIQUE(`referenceNumber`)
);
--> statement-breakpoint
CREATE TABLE `fiscal_years` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`label` varchar(80) NOT NULL,
	`startsOn` timestamp NOT NULL,
	`endsOn` timestamp NOT NULL,
	`isCurrent` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fiscal_years_id` PRIMARY KEY(`id`),
	CONSTRAINT `fiscal_years_year_idx` UNIQUE(`year`)
);
--> statement-breakpoint
CREATE TABLE `payment_calendar_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`beneficiaryId` int,
	`title` varchar(240) NOT NULL,
	`amount` decimal(18,4) NOT NULL,
	`currency` varchar(8) NOT NULL,
	`dueDate` timestamp NOT NULL,
	`notes` text,
	`convertedRequestId` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_calendar_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(100) NOT NULL,
	`labelAr` varchar(160) NOT NULL,
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`roleId` int NOT NULL,
	`permissionId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `role_permission_pk` UNIQUE(`roleId`,`permissionId`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` varchar(240),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `sequence_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fiscalYearId` int NOT NULL,
	`prefix` varchar(24) NOT NULL DEFAULT 'TRZ',
	`nextValue` int NOT NULL DEFAULT 1,
	`padding` int NOT NULL DEFAULT 5,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sequence_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `sequence_fiscal_idx` UNIQUE(`fiscalYearId`)
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`userId` int NOT NULL,
	`roleId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_role_pk` UNIQUE(`userId`,`roleId`)
);
--> statement-breakpoint
CREATE TABLE `workflow_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`disbursement_status` enum('draft','review','approved','executed','rejected') NOT NULL DEFAULT 'draft',
	`comment` text,
	`actorId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflow_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` varchar(160);--> statement-breakpoint
CREATE INDEX `attachments_request_idx` ON `attachments` (`requestId`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `beneficiaries_company_idx` ON `beneficiaries` (`companyId`);--> statement-breakpoint
CREATE INDEX `bank_accounts_beneficiary_idx` ON `beneficiary_bank_accounts` (`beneficiaryId`);--> statement-breakpoint
CREATE INDEX `requests_status_idx` ON `disbursement_requests` (`disbursement_status`);--> statement-breakpoint
CREATE INDEX `requests_schedule_idx` ON `disbursement_requests` (`scheduledFor`);--> statement-breakpoint
CREATE INDEX `requests_company_idx` ON `disbursement_requests` (`companyId`);--> statement-breakpoint
CREATE INDEX `calendar_due_idx` ON `payment_calendar_entries` (`dueDate`);--> statement-breakpoint
CREATE INDEX `workflow_request_idx` ON `workflow_events` (`requestId`);