import { randomUUID } from 'node:crypto';
import { databaseConfig, loadEnvironment } from './config.js';
import { createDatabase, connectionError } from './database.js';
import { sendWhatsAppMessage } from './whatsapp.js';

const env = loadEnvironment();
const workspace = 'legacy-workspace';
const dryRun = process.argv.includes('--dry-run');
const pool = createDatabase(databaseConfig(env));
const normalizePhone = (phone) => /^01\d{8,9}$/.test(String(phone)) ? `6${phone}` : String(phone);

try {
  await pool.connect();
  const candidates = (await pool.request().input('workspace', workspace).query(`
    SELECT m.id AS membership_id, s.full_name, s.whatsapp_number, m.valid_end,
      DATEDIFF(day, CONVERT(date, GETDATE()), CONVERT(date, m.valid_end)) AS days_before
    FROM dbo.memberships m
    JOIN dbo.isapi_staff s ON s.id=m.staff_id
    WHERE s.workspace_id=@workspace
      AND s.is_active=1 AND s.person_type='MEMBER' AND s.whatsapp_number IS NOT NULL
      AND DATEDIFF(day, CONVERT(date, GETDATE()), CONVERT(date, m.valid_end)) IN (7,3,1)
      AND NOT EXISTS (
        SELECT 1 FROM dbo.membership_reminder_logs l
        WHERE l.membership_id=m.id
          AND l.reminder_type=CONCAT('EXPIRY_', DATEDIFF(day, CONVERT(date, GETDATE()), CONVERT(date, m.valid_end)))
          AND l.status='QUEUED'
      )`)).recordset;
  console.log(`${dryRun ? 'Dry run: ' : ''}${candidates.length} reminder(s) found for ${workspace}.`);
  for (const row of candidates) {
    const type = `EXPIRY_${row.days_before}`;
    const phone = normalizePhone(row.whatsapp_number);
    const message = `U FITNESS GYM reminder: your membership expires in ${row.days_before} day${row.days_before === 1 ? '' : 's'} on ${new Date(row.valid_end).toLocaleDateString('en-MY')}. Please renew to keep your membership active.`;
    if (dryRun) { console.log(`${row.full_name} <${phone}>: ${message}`); continue; }
    const id = randomUUID();
    try {
      const queueId = await sendWhatsAppMessage(env, phone, message);
      await pool.request().input('id', id).input('membership_id', row.membership_id)
        .input('type', type).input('phone', phone).input('queue_id', queueId)
        .input('message', message).input('workspace', workspace).query(`
          INSERT INTO dbo.membership_reminder_logs
            (id,membership_id,reminder_type,recipient_phone,status,queue_id,message_body,updated_at,created_at)
          VALUES(@id,@membership_id,@type,@phone,'QUEUED',@queue_id,@message,SYSUTCDATETIME(),SYSUTCDATETIME())`);
      console.log(`Queued ${type} for ${row.full_name}.`);
    } catch (error) { console.error(`Failed ${type} for ${row.full_name}: ${error.message}`); }
  }
} catch (error) { console.error(connectionError(error)); process.exitCode = 1; }
finally { await pool.close(); }
