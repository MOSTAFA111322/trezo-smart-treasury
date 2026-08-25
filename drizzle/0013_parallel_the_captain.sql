ALTER TABLE `sequence_settings` DROP INDEX `sequence_prefix_idx`;
ALTER TABLE `sequence_settings` ADD CONSTRAINT `sequence_fiscal_prefix_idx` UNIQUE(`fiscalYearId`,`prefix`);
