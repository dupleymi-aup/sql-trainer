/**
 * SQL safety validation for training mode.
 * Shared between execute and explain routes to prevent DDL/DML injection.
 */

/**
 * Allowed SQL statement prefixes for training mode.
 * Only these statement types are permitted.
 */
export const ALLOWED_PREFIXES = ['SELECT', 'WITH', 'EXPLAIN', 'PRAGMA', 'SHOW', 'DESCRIBE', 'DESC'] as const;

/**
 * Blocked SQL statement prefixes - DDL and DML that could be destructive.
 */
export const BLOCKED_PREFIXES = [
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'RENAME',
  'ATTACH',
  'DETACH',
  'LOAD',
  'INSERT',
  'UPDATE',
  'DELETE',
  'REPLACE',
  'GRANT',
  'REVOKE',
  'PRAGMA writable_schema',
] as const;

/**
 * Tokenize SQL to extract statement types, handling comments and strings.
 * This prevents bypassing filters via comment injection.
 * Returns the first word of each semicolon-separated statement.
 */
export function extractStatementTypes(sql: string): string[] {
  const statements: string[] = [];
  const upper = sql.toUpperCase();

  // First, mask comments and string literals to avoid splitting on semicolons inside them
  let i = 0;
  const masked = upper.split('');
  while (i < masked.length) {
    // Mask block comments
    if (upper.startsWith('/*', i)) {
      const end = upper.indexOf('*/', i + 2);
      const endIdx = end === -1 ? masked.length - 1 : end + 1;
      for (let j = i; j <= endIdx && j < masked.length; j++) {
        masked[j] = ' ';
      }
      i = end === -1 ? masked.length : end + 2;
      continue;
    }

    // Mask line comments
    if (upper.startsWith('--', i)) {
      const end = upper.indexOf('\n', i);
      const endIdx = end === -1 ? masked.length - 1 : end;
      for (let j = i; j <= endIdx && j < masked.length; j++) {
        masked[j] = ' ';
      }
      i = end === -1 ? masked.length : end + 1;
      continue;
    }

    // Mask string literals
    if (upper[i] === "'" || upper[i] === '"') {
      const quote = upper[i];
      masked[i] = ' ';
      i++;
      while (i < masked.length) {
        if (upper[i] === quote && i + 1 < upper.length && upper[i + 1] === quote) {
          masked[i] = ' ';
          masked[i + 1] = ' ';
          i += 2;
          continue;
        }
        masked[i] = ' ';
        if (upper[i] === quote) break;
        i++;
      }
      i++;
      continue;
    }

    i++;
  }

  // Now split by semicolons (comments and strings are already masked)
  const cleanSql = masked.join('');
  const parts = cleanSql.split(';');

  for (const part of parts) {
    // Skip empty parts
    if (!part.trim()) continue;

    // Extract the first word
    let j = 0;
    while (j < part.length) {
      if (/\s/.test(part[j])) {
        j++;
        continue;
      }

      let word = '';
      while (j < part.length && /[A-Z0-9_.]/.test(part[j])) {
        word += part[j];
        j++;
      }

      if (word) {
        statements.push(word.split('.')[0]);
        break;
      }

      j++;
    }
  }

  return statements;
}

/**
 * Validate SQL for safety in training mode.
 * Uses tokenization to prevent comment injection bypass.
 * Returns null if valid, or an error message string if blocked.
 */
export function validateTrainingSql(sql: string): string | null {
  // Check length limit
  if (sql.length > 10000) {
    return 'SQL query too long (max 10000 characters)';
  }

  const statementTypes = extractStatementTypes(sql);

  for (const stmt of statementTypes) {
    // Check against blocked prefixes first (more specific)
    for (const blocked of BLOCKED_PREFIXES) {
      if (stmt === blocked || stmt.startsWith(blocked + ' ')) {
        return `Request contains blocked commands (${stmt}). In learning mode, only SELECT, WITH, EXPLAIN, PRAGMA are allowed.`;
      }
    }

    // Special handling for PRAGMA: only safe PRAGMAs are allowed
    if (stmt === 'PRAGMA') {
      // PRAGMA writable_schema is dangerous - check the full SQL for this pattern
      if (/\bPRAGMA\s+writable_schema\b/i.test(sql)) {
        return `Request contains blocked commands (PRAGMA writable_schema). In learning mode, only SELECT, WITH, EXPLAIN, PRAGMA are allowed.`;
      }
      // Other PRAGMAs are allowed (e.g., PRAGMA table_info)
      continue;
    }

    // Check against allowed prefixes
    const isAllowed = ALLOWED_PREFIXES.some((allowed) => stmt === allowed || stmt.startsWith(allowed + ' '));

    if (!isAllowed && stmt.length > 0) {
      return `Unknown SQL command (${stmt}). In learning mode, only SELECT, WITH, EXPLAIN, PRAGMA are allowed.`;
    }
  }

  return null;
}

/**
 * DDL-only prefixes blocked in verify mode.
 * DML (INSERT/UPDATE/DELETE) is allowed here because some training tasks require it.
 */
const DDL_BLOCKED_PREFIXES = [
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'RENAME',
  'ATTACH',
  'DETACH',
  'LOAD',
  'GRANT',
  'REVOKE',
  'PRAGMA writable_schema',
] as const;

/**
 * Validate SQL for DDL safety in verify mode.
 * Blocks destructive DDL (DROP/CREATE/ALTER/TRUNCATE) while allowing DML
 * that some training tasks require (INSERT/UPDATE/DELETE).
 * Returns null if valid, or an error message string if blocked.
 */
export function validateTrainingSqlDdlOnly(sql: string): string | null {
  if (sql.length > 10000) {
    return 'SQL query too long (max 10000 characters)';
  }

  const statementTypes = extractStatementTypes(sql);

  for (const stmt of statementTypes) {
    for (const blocked of DDL_BLOCKED_PREFIXES) {
      if (stmt === blocked || stmt.startsWith(blocked + ' ')) {
        return `Request contains blocked DDL command (${stmt}). Destructive schema changes are not allowed.`;
      }
    }

    if (stmt === 'PRAGMA') {
      if (/\bPRAGMA\s+writable_schema\b/i.test(sql)) {
        return `Request contains blocked command (PRAGMA writable_schema).`;
      }
      continue;
    }
  }

  return null;
}
