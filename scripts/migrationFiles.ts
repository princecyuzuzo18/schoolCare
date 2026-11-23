import fs from 'node:fs';
import path from 'node:path';

/**
 * Return migration files in a deterministic numeric order.
 *
 * Filenames must use the NNN_description.sql convention. Duplicate numeric
 * prefixes (the live database already has two applied 005_* migrations) are
 * allowed but reported, because they make ordering depend on the description.
 */
export function listMigrationFiles(migrationsDir: string): string[] {
  const files = fs.readdirSync(migrationsDir).filter(name => name.endsWith('.sql'));
  const invalid = files.filter(name => !/^\d{3}_.+\.sql$/.test(name));
  if (invalid.length > 0) {
    throw new Error(
      `Migration filenames must use NNN_description.sql: ${invalid.join(', ')}`
    );
  }

  const prefixes = new Map<string, string[]>();
  for (const name of files) {
    const prefix = name.slice(0, 3);
    prefixes.set(prefix, [...(prefixes.get(prefix) ?? []), name]);
  }
  for (const [prefix, names] of prefixes) {
    if (names.length > 1) {
      console.warn(
        `Warning: migration prefix ${prefix} is used by ${names.length} files (${names.join(', ')}). ` +
        `Ordering between them depends on the filename; assign a unique prefix to future migrations.`
      );
    }
  }

  return files.sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)) || a.localeCompare(b));
}
