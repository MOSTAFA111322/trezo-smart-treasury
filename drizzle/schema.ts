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

export const localAuthAccounts = mysqlTable("local_auth_accounts", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 80 }).notNull().unique(),
  userId: int("userId").notNull().unique(),
  employeeId: int("employeeId").unique(),
  secretHash: text("secretHash").notNull(),
  mustChangeSecret: boolean("mustChangeSecret").default(true).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  failedAttempts: int("failedAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),
  lastLoginAt: timestamp("lastLoginAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ usernameIdx: uniqueIndex("local_auth_accounts_username_idx").on(table.username) }));

export const localAuthSessions = mysqlTable("local_auth_sessions", {
  id: int("id").autoincrement().primaryKey(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  userId: int("userId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ tokenIdx: uniqueIndex("local_auth_sessions_token_idx").on(table.tokenHash) }));

export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  legalName: varchar("legalName", { length: 220 }),
  registrationNumber: varchar("registrationNumber", { length: 80 }),
  taxNumber: varchar("taxNumber", { length: 80 }),
  phone: varchar("phone", { length: 40 }),
  address: varchar("address", { length: 300 }),
  logoUrl: varchar("logoUrl", { length: 500 }),
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

export const exchangeRates = mysqlTable("exchange_rates", {
  id: int("id").autoincrement().primaryKey(),
  baseCurrency: varchar("baseCurrency", { length: 8 }).notNull(),
  quoteCurrency: varchar("quoteCurrency", { length: 8 }).notNull(),
  rate: decimal("rate", { precision: 24, scale: 10 }).notNull(),
  effectiveAt: timestamp("effectiveAt").notNull(),
  source: varchar("source", { length: 120 }),
  createdBy: int("createdBy").notNull(),
  approvalStatus: mysqlEnum("exchange_rate_approval_status", ["pending", "approved", "rejected", "voided"]).default("pending").notNull(),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  approvalNote: text("approvalNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ pairIdx: index("exchange_rates_pair_idx").on(table.baseCurrency, table.quoteCurrency), effectiveIdx: index("exchange_rates_effective_idx").on(table.effectiveAt) }));

export const overdueAlertConfigs = mysqlTable("overdue_alert_configs", {
  id: int("id").autoincrement().primaryKey(),
  isEnabled: boolean("isEnabled").default(true).notNull(),
  cronExpression: varchar("cronExpression", { length: 64 }).default("0 0 6 * * *").notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ taskUidIdx: index("overdue_alert_configs_task_uid_idx").on(table.scheduleCronTaskUid) }));

export const overdueAlertDeliveries = mysqlTable("overdue_alert_deliveries", {
  id: int("id").autoincrement().primaryKey(),
  alertConfigId: int("alertConfigId").notNull(),
  deliveryDate: varchar("deliveryDate", { length: 10 }).notNull(),
  status: mysqlEnum("overdue_alert_delivery_status", ["pending", "sent", "failed"]).default("pending").notNull(),
  requestCount: int("requestCount").default(0).notNull(),
  content: text("content"),
  lastError: text("lastError"),
  attempts: int("attempts").default(0).notNull(),
  lastAttemptAt: timestamp("lastAttemptAt"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ deliveryIdx: uniqueIndex("overdue_alert_deliveries_config_date_idx").on(table.alertConfigId, table.deliveryDate) }));

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

export const approvalStage = mysqlEnum("approval_stage", ["accountant", "reviewer", "cfo", "gm", "auditor"]);

export const approvalPolicies = mysqlTable("approval_policies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  companyId: int("companyId"),
  minAmount: decimal("minAmount", { precision: 18, scale: 4 }),
  maxAmount: decimal("maxAmount", { precision: 18, scale: 4 }),
  stages: json("stages").notNull(),
  allowSkip: boolean("allowSkip").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ companyIdx: index("approval_policies_company_idx").on(table.companyId), activeIdx: index("approval_policies_active_idx").on(table.isActive) }));

export const requestApprovalRoutes = mysqlTable("request_approval_routes", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("requestId").notNull().unique(),
  policyId: int("policyId"),
  stagesSnapshot: json("stagesSnapshot").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const approvalDelegations = mysqlTable("approval_delegations", {
  id: int("id").autoincrement().primaryKey(),
  fromRole: approvalStage.notNull(),
  delegateUserId: int("delegateUserId").notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  reason: text("reason").notNull(),
  createdBy: int("createdBy").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ roleIdx: index("approval_delegations_role_idx").on(table.fromRole), dateIdx: index("approval_delegations_date_idx").on(table.startsAt, table.endsAt) }));

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

export const internalEmployees = mysqlTable("internal_employees", {
  id: int("id").autoincrement().primaryKey(),
  employeeNo: varchar("employeeNo", { length: 64 }).notNull().unique(),
  fullName: varchar("fullName", { length: 180 }).notNull(),
  department: varchar("department", { length: 160 }),
  jobTitle: varchar("jobTitle", { length: 160 }),
  phone: varchar("phone", { length: 40 }),
  operationalRole: mysqlEnum("operationalRole", ["accountant", "reviewer", "cfo", "gm", "auditor"]).notNull(),
  linkedUserId: int("linkedUserId"),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ employeeNoIdx: uniqueIndex("internal_employees_employee_no_idx").on(table.employeeNo), roleIdx: index("internal_employees_role_idx").on(table.operationalRole) }));

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
