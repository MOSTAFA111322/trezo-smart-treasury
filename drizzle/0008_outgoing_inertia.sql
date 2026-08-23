CREATE TABLE `local_auth_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(80) NOT NULL,
	`userId` int NOT NULL,
	`employeeId` int,
	`secretHash` text NOT NULL,
	`mustChangeSecret` boolean NOT NULL DEFAULT true,
	`isActive` boolean NOT NULL DEFAULT true,
	`failedAttempts` int NOT NULL DEFAULT 0,
	`lockedUntil` timestamp,
	`lastLoginAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `local_auth_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `local_auth_accounts_username_unique` UNIQUE(`username`),
	CONSTRAINT `local_auth_accounts_userId_unique` UNIQUE(`userId`),
	CONSTRAINT `local_auth_accounts_employeeId_unique` UNIQUE(`employeeId`),
	CONSTRAINT `local_auth_accounts_username_idx` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `local_auth_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`userId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `local_auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `local_auth_sessions_tokenHash_unique` UNIQUE(`tokenHash`),
	CONSTRAINT `local_auth_sessions_token_idx` UNIQUE(`tokenHash`)
);
