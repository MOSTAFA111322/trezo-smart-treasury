CREATE TABLE `internal_employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeNo` varchar(64) NOT NULL,
	`fullName` varchar(180) NOT NULL,
	`department` varchar(160),
	`jobTitle` varchar(160),
	`phone` varchar(40),
	`operationalRole` enum('accountant','reviewer','cfo','gm','auditor') NOT NULL,
	`linkedUserId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `internal_employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `internal_employees_employeeNo_unique` UNIQUE(`employeeNo`),
	CONSTRAINT `internal_employees_employee_no_idx` UNIQUE(`employeeNo`)
);
--> statement-breakpoint
CREATE INDEX `internal_employees_role_idx` ON `internal_employees` (`operationalRole`);