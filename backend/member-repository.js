import sql from 'mssql';

export class MemberRepository {
  constructor(connection, workspace, inTransaction = false) {
    this.connection = connection;
    this.workspace = workspace;
    this.inTransaction = inTransaction;
  }

  async query(text, parameters = {}) {
    const request = new sql.Request(this.connection);
    request.input('workspace', sql.NVarChar(128), this.workspace);
    for (const [name, value] of Object.entries(parameters)) {
      request.input(name, Buffer.isBuffer(value) ? sql.VarBinary(sql.MAX) : value instanceof Date ? sql.DateTime2 :
        typeof value === 'boolean' ? sql.Bit : sql.NVarChar(sql.MAX), value);
    }
    return (await request.query(text)).recordset ?? [];
  }

  async transaction(action) {
    if (this.inTransaction) return action(this);
    const transaction = new sql.Transaction(this.connection);
    await transaction.begin();
    try {
      const result = await action(new MemberRepository(transaction, this.workspace, true));
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback().catch(() => {});
      throw error;
    }
  }

  plans() {
    return this.query(`SELECT id, name, price_cents AS priceCents,
      COALESCE(duration_value, duration_days) AS durationValue, duration_unit AS durationUnit
      FROM dbo.membership_plans WHERE workspace_id=@workspace
      AND is_active=1 AND deleted_at IS NULL AND is_registration_fee=0 ORDER BY price_cents, name`);
  }

  async staff(id, login = false) {
    const rows = await this.query(`SELECT TOP (2) s.id, s.employee_no AS memberId,
      s.full_name AS name, s.whatsapp_number AS phone, s.email,
      CONVERT(varchar(10), p.birth_date, 23) AS birthDate,
      COALESCE(p.photo_key,s.photo_key) AS photoKey,
p.photo_key AS memberPhotoKey,
 COALESCE(p.push_enabled,1) AS pushEnabled
      FROM dbo.isapi_staff s LEFT JOIN dbo.member_app_profiles p ON p.staff_id=s.id
      WHERE s.workspace_id=@workspace AND s.is_active=1 AND s.person_type='MEMBER'
      AND (s.id=@id ${login ? 'OR s.employee_no=@id' : ''})`, { id });
    return rows.length === 1 ? rows[0] : null;
  }

async staffByPhone(phone) {
  const rows = await this.query(`SELECT TOP (2)
      s.id,
      s.employee_no AS memberId,
      s.full_name AS name,
      s.whatsapp_number AS phone,
      s.email,
      CONVERT(varchar(10), p.birth_date, 23) AS birthDate,
      COALESCE(p.photo_key,s.photo_key) AS photoKey,
      COALESCE(p.push_enabled,1) AS pushEnabled
    FROM dbo.isapi_staff s
    LEFT JOIN dbo.member_app_profiles p ON p.staff_id=s.id
    WHERE s.workspace_id=@workspace
      AND s.is_active=1
      AND s.person_type='MEMBER'
      AND (
        s.whatsapp_number=@phone
        OR s.whatsapp_number='0' + SUBSTRING(@phone,3,50)
      )`, { phone });

  return rows.length === 1 ? rows[0] : null;
}

  async application(id) {
    return (await this.query(`SELECT id, staff_id AS staffId, full_name AS name,
      phone, email, photo_key AS photoKey, status FROM dbo.member_app_requests
      WHERE workspace_id=@workspace AND id=@id AND kind='REGISTER'`, { id }))[0];
  }

  async registrationExists(phone) {
    return (await this.query(`SELECT TOP (1) id FROM dbo.isapi_staff
      WHERE workspace_id=@workspace AND person_type='MEMBER'
      AND (whatsapp_number=@phone OR whatsapp_number='0'+SUBSTRING(@phone,3,50))
      UNION ALL SELECT TOP (1) id FROM dbo.member_app_requests
      WHERE workspace_id=@workspace AND kind='REGISTER'
      AND status IN ('PENDING','PROCESSING','APPROVED')
      AND (phone=@phone OR phone='0'+SUBSTRING(@phone,3,50))`, { phone })).length > 0;
  }

  async applicationByPhone(phone) {
    const rows = await this.query(`SELECT TOP (2) id, staff_id AS staffId,
      full_name AS name, phone, photo_key AS photoKey, status
      FROM dbo.member_app_requests WHERE workspace_id=@workspace AND kind='REGISTER'
      AND status IN ('PENDING','PROCESSING') AND (phone=@phone OR phone='0'+SUBSTRING(@phone,3,50))`, { phone });
    return rows.length === 1 ? rows[0] : null;
  }

  async session(hash) {
    return (await this.query(`SELECT staff_id AS staffId, request_id AS requestId
      FROM dbo.member_app_sessions WHERE workspace_id=@workspace AND token_hash=@hash
      AND expires_at>SYSUTCDATETIME()`, { hash }))[0];
  }

  createSession(hash, staffId, requestId) {
    return this.query(`INSERT INTO dbo.member_app_sessions
      (token_hash,staff_id,request_id,expires_at,created_at,workspace_id)
      VALUES(@hash,@staffId,@requestId,DATEADD(day,7,SYSUTCDATETIME()),SYSUTCDATETIME(),@workspace)`,
    { hash, staffId, requestId });
  }

  logout(hash) {
    return this.query('DELETE FROM dbo.member_app_sessions WHERE workspace_id=@workspace AND token_hash=@hash', { hash });
  }

  async membership(staffId) {
    return (await this.query(`SELECT TOP (1) p.name AS [plan], m.status,
      m.valid_start AS validStart, m.valid_end AS validEnd
      FROM dbo.memberships m JOIN dbo.isapi_staff s ON s.id=m.staff_id
      JOIN dbo.membership_plans p ON p.id=m.plan_id AND p.workspace_id=@workspace
      WHERE s.workspace_id=@workspace AND s.id=@staffId ORDER BY m.valid_end DESC`, { staffId }))[0] ?? null;
  }

  async membershipPlans() {
    return await this.query(`
      SELECT
        id,
        code,
        name,
        duration_days AS durationDays,
        duration_value AS durationValue,
        duration_unit AS durationUnit,
        price_cents AS priceCents,
        is_registration_fee AS isRegistrationFee
      FROM dbo.membership_plans
      WHERE workspace_id=@workspace
        AND is_active=1
        AND deleted_at IS NULL
      ORDER BY duration_days ASC
    `);
  }

  requests(staffId, requestId) {
    return this.query(`SELECT r.id,r.kind,r.status,r.rejection_reason AS reason,
      r.created_at AS createdAt,p.name AS [plan]
      FROM dbo.member_app_requests r LEFT JOIN dbo.membership_plans p
      ON p.id=r.plan_id AND p.workspace_id=@workspace
      WHERE r.workspace_id=@workspace AND (r.staff_id=@staffId OR r.id=@requestId)
      ORDER BY r.created_at DESC`, { staffId, requestId });
  }

  async settings() {
    return (await this.query(`SELECT TOP (1) payment_instructions AS paymentInstructions,
      contact_phone AS contactPhone,contact_email AS contactEmail,contact_hours AS contactHours
      FROM dbo.member_app_settings WHERE workspace_id=@workspace ORDER BY id`))[0] ?? {};
  }

  events(staffId) {
    return this.query(`SELECT e.direction,e.occurred_at AS occurredAt
      FROM dbo.access_events e JOIN dbo.isapi_staff s
      ON s.employee_no=e.employee_no AND s.workspace_id=e.workspace_id
      WHERE s.workspace_id=@workspace AND s.id=@staffId
      AND e.occurred_at>=DATEADD(hour,-8,CONVERT(datetime2,
        DATEADD(day,-6,CONVERT(date,DATEADD(hour,8,SYSUTCDATETIME())))))
      AND e.occurred_at<=SYSUTCDATETIME() ORDER BY e.occurred_at`, { staffId });
  }

  createRequest(data) {
    if (data.kind === 'REGISTER') {
      return this.query(`IF EXISTS (SELECT 1 FROM dbo.isapi_staff WITH (UPDLOCK,HOLDLOCK)
        WHERE workspace_id=@workspace AND person_type='MEMBER'
        AND (whatsapp_number=@phone OR whatsapp_number='0'+SUBSTRING(@phone,3,50)))
        OR EXISTS (SELECT 1 FROM dbo.member_app_requests WITH (UPDLOCK,HOLDLOCK)
        WHERE workspace_id=@workspace AND kind='REGISTER' AND status IN ('PENDING','PROCESSING','APPROVED')
        AND (phone=@phone OR phone='0'+SUBSTRING(@phone,3,50)))
        THROW 50003, 'Registration already exists', 1;
        INSERT INTO dbo.member_app_requests
        (id,kind,staff_id,full_name,phone,email,plan_id,photo_key,receipt_key,status,created_at,updated_at,workspace_id)
        SELECT @id,'REGISTER',NULL,@name,@phone,@email,p.id,@photoKey,@receiptKey,'PENDING',
        SYSUTCDATETIME(),SYSUTCDATETIME(),@workspace
        FROM dbo.membership_plans p WHERE p.id=@planId AND p.workspace_id=@workspace
        AND p.is_active=1 AND p.deleted_at IS NULL AND p.is_registration_fee=0;
        IF @@ROWCOUNT=0 THROW 50001, 'Plan unavailable', 1;`, data);
    }
    return this.query(`INSERT INTO dbo.member_app_requests
      (id,kind,staff_id,full_name,phone,email,plan_id,photo_key,receipt_key,status,created_at,updated_at,workspace_id)
      SELECT @id,@kind,@staffId,@name,@phone,@email,p.id,@photoKey,@receiptKey,'PENDING',
        SYSUTCDATETIME(),SYSUTCDATETIME(),@workspace
      FROM dbo.membership_plans p WHERE p.id=@planId AND p.workspace_id=@workspace
      AND p.is_active=1 AND p.deleted_at IS NULL AND p.is_registration_fee=0;
      IF @@ROWCOUNT=0 THROW 50001, 'Plan unavailable', 1;`, data);
  }

  updateProfile(staffId, data) {
    return this.query(`UPDATE dbo.isapi_staff SET full_name=@name,whatsapp_number=@phone,
      email=@email,photo_key=COALESCE(@photoKey,photo_key),updated_at=SYSUTCDATETIME() WHERE workspace_id=@workspace AND id=@staffId;
      IF @@ROWCOUNT=0 THROW 50002, 'Member unavailable', 1;
      UPDATE dbo.member_app_profiles WITH (UPDLOCK,SERIALIZABLE)
      SET birth_date=CONVERT(date,@birthDate),photo_key=COALESCE(@photoKey,photo_key)
      WHERE staff_id=@staffId;
      IF @@ROWCOUNT=0 INSERT INTO dbo.member_app_profiles(staff_id,birth_date,photo_key,push_enabled)
      VALUES(@staffId,CONVERT(date,@birthDate),@photoKey,1);`, { staffId, ...data });
  }

  updatePhoto(staffId, photoKey) {
    return this.query(`IF NOT EXISTS (SELECT 1 FROM dbo.isapi_staff
      WHERE id=@staffId AND workspace_id=@workspace AND is_active=1 AND person_type='MEMBER')
      THROW 50002, 'Member unavailable', 1;
      UPDATE dbo.isapi_staff SET photo_key=@photoKey,updated_at=SYSUTCDATETIME()
      WHERE id=@staffId AND workspace_id=@workspace;
      UPDATE dbo.member_app_profiles WITH (UPDLOCK,SERIALIZABLE)
      SET photo_key=@photoKey WHERE staff_id=@staffId;
      IF @@ROWCOUNT=0 INSERT INTO dbo.member_app_profiles(staff_id,photo_key,push_enabled)
      VALUES(@staffId,@photoKey,1);`, { staffId, photoKey });
  }

  savePhoto({ storageKey, bytes, contentType }) {
    return this.query(`INSERT INTO dbo.media_files
      (storage_key,media_kind,content_type,byte_size,content,created_at)
      VALUES(@storageKey,'PHOTO',@contentType,DATALENGTH(@bytes),@bytes,SYSUTCDATETIME())`,
      { storageKey, bytes, contentType });
  }

  // Called only with the photo key resolved from the authenticated identity.
  async mediaPhoto(storageKey) {
    const rows = await this.query(`SELECT TOP (2) content AS bytes, content_type AS contentType
      FROM dbo.media_files WHERE storage_key=@storageKey`, { storageKey });
    return rows.length === 1 ? rows[0] : null;
  }
}
