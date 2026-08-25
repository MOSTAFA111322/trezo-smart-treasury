ALTER TABLE `sequence_settings` MODIFY COLUMN `prefix` varchar(24) NOT NULL;--> statement-breakpoint
ALTER TABLE `sequence_settings` ADD `companyId` int NULL;--> statement-breakpoint
ALTER TABLE `sequence_settings` DROP INDEX `fiscalYearId`;--> statement-breakpoint
UPDATE `sequence_settings` SET `companyId` = (SELECT MIN(`id`) FROM `companies` WHERE `isActive` = 1) WHERE `companyId` IS NULL;--> statement-breakpoint
UPDATE `sequence_settings` SET `prefix` = LEFT(CONCAT(`prefix`, '-C', `companyId`), 24) WHERE `prefix` = 'TRZ' AND `companyId` IS NOT NULL;--> statement-breakpoint
INSERT INTO `sequence_settings` (`fiscalYearId`, `companyId`, `prefix`, `nextValue`, `padding`)
SELECT fy.`id`, c.`id`, LEFT(CONCAT('TRZ-C', c.`id`), 24), 1, 5
FROM `fiscal_years` fy CROSS JOIN `companies` c
WHERE c.`isActive` = 1
  AND NOT EXISTS (
    SELECT 1 FROM `sequence_settings` s
    WHERE s.`fiscalYearId` = fy.`id` AND s.`companyId` = c.`id`
  );--> statement-breakpoint
ALTER TABLE `sequence_settings` MODIFY COLUMN `companyId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `sequence_settings` ADD CONSTRAINT `sequence_fiscal_company_idx` UNIQUE(`fiscalYearId`,`companyId`);--> statement-breakpoint
ALTER TABLE `sequence_settings` ADD CONSTRAINT `sequence_prefix_idx` UNIQUE(`prefix`);
