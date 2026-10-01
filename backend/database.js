import sql from 'mssql';

export function createDatabase(config) {
  const pool = new sql.ConnectionPool(config);
  pool.on('error', () => console.error('SQL connection interrupted.'));
  return pool;
}

export function connectionError(error) {
  const messages = {
    ELOGIN: 'SQL login failed. Check the username, password and database access.',
    ETIMEOUT: 'SQL connection timed out. Check the server address, TCP port and firewall.',
    ESOCKET: 'SQL connection failed. Check TCP connectivity and the server TLS certificate.',
  };
  return messages[error.code] || 'Database check failed. Verify the SQL connection settings and metadata permissions.';
}
