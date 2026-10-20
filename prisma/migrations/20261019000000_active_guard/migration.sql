-- PostgreSQL is the final guard against two active applications, including appeals.
CREATE UNIQUE INDEX "Application_one_active_per_applicant"
ON "Application" ("guildId", "applicantId")
WHERE "status" IN ('DRAFT', 'NEW', 'IN_REVIEW', 'NEEDS_INFO', 'ON_HOLD', 'APPEAL');
