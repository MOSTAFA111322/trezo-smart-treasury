import { boolean, decimal, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 128 }).notNull().unique(),
  name: varchar("name", { length: 160 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  legalName: varchar("legalName", { length: 220 }),
  registrationNumber: varchar("registrationNumber", { length: 80 }),
  defaultCurrency: varchar("defaultCurrency", { length: 8 }).default("SAR").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ nameIdx: uniqueIndex("companies_name_idx").on(table.name) }));

export const beneficiaries = mysqlTable("beneficiaries", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  type: mysqlEnum("type", ["individual", "organization"]).default("organization").notNull(),
  taxNumber: varchar("taxNumber", { length: 80 }),
  phone: varchar("phone", { length: 40 }),
  email: varchar("email", { length: 320 }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ companyIdx: index("beneficiaries_company_idx").on(table.companyId) }));

export const banks = mysqlTable("banks", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  swiftCode: varchar("swiftCode", { length: 40 }),
  country: varchar("country", { length: 80 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const beneficiaryBankAccounts = mysqlTable("beneficiary_bank_accounts", {
  id: int("id").autoincrement().primaryKey(),
  beneficiaryId: int("beneficiaryId").notNull(),
  bankId: int("bankId").notNull(),
  accountName: varchar("accountName", { length: 180 }).notNull(),
  iban: varchar("iban", { length: 64 }).notNull(),
  currency: varchar("currency", { length: 8 }).notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ beneficiaryIdx: index("bank_accounts_beneficiary_idx").on(table.beneficiaryId) }));

export const disbursementChannels = mysqlTable("disbursement_channels", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const currencies = mysqlTable("currencies", {
  code: varchar("code", { length: 8 }).primaryKey(),
  nameAr: varchar("nameAr", { length: 80 }).notNull(),
  nameEn: varchar("nameEn", { length: 80 }).notNull(),
  symbol: varchar("symbol", { length: 12 }).notNull(),
  decimals: int("decimals").default(2).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
});

export const fiscalYears = mysqlTable("fiscal_years", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  label: varchar("label", { length: 80 }).notNull(),
  startsOn: timestamp("startsOn").notNull(),
  endsOn: timestamp("endsOn").notNull(),
  isCurrent: boolean("isCurrent").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ yearIdx: uniqueIndex("fiscal_years_year_idx").on(table.year) }));

export const sequenceSettings = mysqlTable("sequence_settings", {
  id: int("id").autoincrement().primaryKey(),
  fiscalYearId: int("fiscalYearId").notNull(),
  prefix: varchar("prefix", { length: 24 }).default("TRZ").notNull(),
  nextValue: int("nextValue").default(1).notNull(),
  padding: int("padding").default(5).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ fiscalIdx: uniqueIndex("sequence_fiscal_idx").on(table.fiscalYearId) }));

export const disbursementStatus = mysqlEnum("disbursement_status", ["draft", "review", "approved", "executed", "rejected"]);
export const workflowFromStatus = mysqlEnum("workflow_from_status", ["draft", "review", "approved", "executed", "rejected"]);
export const workflowToStatus = mysqlEnum("workflow_to_status", ["draft", "review", "approved", "executed", "rejected"]);

export const disbursementRequests = mysqlTable("disbursement_requests", {
  id: int("id").autoincrement().primaryKey(),
  referenceNumber: varchar("referenceNumber", { length: 48 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  beneficiaryId: int("beneficiaryId").notNull(),
  bankAccountId: int("bankAccountId"),
  channelId: int("channelId").notNull(),
  fiscalYearId: int("fiscalYearId").notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  description: text("description"),
  amount: decimal("amount", { precision: 18, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 8 }).notNull(),
  amountInWords: text("amountInWords").notNull(),
  scheduledFor: timestamp("scheduledFor"),
  status: disbursementStatus.default("draft").notNull(),
  rejectionReason: text("rejectionReason"),
  createdBy: int("createdBy").notNull(),
  submittedAt: timestamp("submittedAt"),
  approvedAt: timestamp("approvedAt"),
  executedAt: timestamp("executedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ statusIdx: index("requests_status_idx").on(table.status), scheduleIdx: index("requests_schedule_idx").on(table.scheduledFor), companyIdx: index("requests_company_idx").on(table.companyId) }));

export const workflowEvents = mysqlTable("workflow_events", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId").notNull(),
  fromStatus: workflowFromStatus,
  toStatus: workflowToStatus.notNull(),
  comment: text("comment"),
  actorId: int("actorId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ requestIdx: index("workflow_request_idx").on(table.requestId) }));

export const paymentCalendarEntries = mysqlTable("payment_calendar_entries", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  beneficiaryId: int("beneficiaryId"),
  title: varchar("title", { length: 240 }).notNull(),
  amount: decimal("amount", { precision: 18, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 8 }).notNull(),
  dueDate: timestamp("dueDate").notNull(),
  notes: text("notes"),
  convertedRequestId: int("convertedRequestId"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ dueIdx: index("calendar_due_idx").on(table.dueDate) }));

export const attachments = mysqlTable("attachments", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId").notNull(),
  fileName: varchar("fileName", { length: 240 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  uploadedBy: int("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ requestIdx: index("attachments_request_idx").on(table.requestId) }));

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  actorId: int("actorId").notNull(),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entityType", { length: 80 }).notNull(),
  entityId: varchar("entityId", { length: 80 }),
  beforeData: json("beforeData"),
  afterData: json("afterData"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ entityIdx: index("audit_entity_idx").on(table.entityType, table.entityId), createdIdx: index("audit_created_idx").on(table.createdAt) }));

export const roles = mysqlTable("roles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: varchar("description", { length: 240 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const permissions = mysqlTable("permissions", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 100 }).notNull().unique(),
  labelAr: varchar("labelAr", { length: 160 }).notNull(),
});

export const rolePermissions = mysqlTable("role_permissions", {
  roleId: int("roleId").notNull(),
  permissionId: int("permissionId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ pk: uniqueIndex("role_permission_pk").on(table.roleId, table.permissionId) }));

export const userRoles = mysqlTable("user_roles", {
  userId: int("userId").notNull(),
  roleId: int("roleId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ pk: uniqueIndex("user_role_pk").on(table.userId, table.roleId) }));

export const companiesRelations = relations(companies, ({ many }) => ({ beneficiaries: many(beneficiaries), requests: many(disbursementRequests) }));
export const beneficiariesRelations = relations(beneficiaries, ({ many }) => ({ bankAccounts: many(beneficiaryBankAccounts), requests: many(disbursementRequests) }));
export const requestsRelations = relations(disbursementRequests, ({ many }) => ({ workflowEvents: many(workflowEvents), attachments: many(attachments) }));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Company = typeof companies.$inferSelect;
export type Beneficiary = typeof beneficiaries.$inferSelect;
export type DisbursementRequest = typeof disbursementRequests.$inferSelect;
export type WorkflowEvent = typeof workflowEvents.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
