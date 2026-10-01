-- Allow a profile-only registration. Existing records remain unchanged.
-- Renewals must still include a plan and payment receipt.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
ALTER TABLE dbo.member_app_requests ALTER COLUMN plan_id nvarchar(128) NULL;
ALTER TABLE dbo.member_app_requests ALTER COLUMN receipt_key nvarchar(512) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
 WHERE parent_object_id=OBJECT_ID('dbo.member_app_requests')
 AND name='CK_member_app_requests_renew_details')
ALTER TABLE dbo.member_app_requests WITH CHECK ADD CONSTRAINT CK_member_app_requests_renew_details
 CHECK (kind='REGISTER' OR (plan_id IS NOT NULL AND receipt_key IS NOT NULL));
COMMIT TRANSACTION;
