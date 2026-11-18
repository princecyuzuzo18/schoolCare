import { execFileSync } from 'node:child_process';
import { emitKeypressEvents, createInterface } from 'node:readline';
import {
  ensureCredentialTable,
  listProvisionableAccounts,
  provisionInitialPassword
} from './authCredentials';

function requireElevatedWindowsAdministrator(): void {
  if (process.platform !== 'win32') {
    throw new Error('Account provisioning is restricted to an elevated Windows Administrator terminal.');
  }

  const command = [
    '$identity = [Security.Principal.WindowsIdentity]::GetCurrent()',
    '$principal = [Security.Principal.WindowsPrincipal]::new($identity)',
    'if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 0 }',
    'exit 1'
  ].join('; ');

  try {
    execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
      stdio: 'ignore',
      timeout: 5000,
      windowsHide: true
    });
  } catch {
    throw new Error('Not authorized. Open PowerShell using Run as administrator, then run this command again.');
  }
}

function askLine(question: string): Promise<string> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => terminal.question(question, answer => {
    terminal.close();
    resolve(answer.trim());
  }));
}

function readPassword(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.reject(new Error('Use an interactive Administrator PowerShell terminal to enter the password securely.'));
  }

  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write(prompt);

  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onData = (chunk: Buffer) => {
      const input = chunk.toString('utf8');
      if (input === '\u0003') {
        cleanup();
        reject(new Error('Account provisioning cancelled.'));
      } else if (input === '\r' || input === '\n') {
        cleanup();
        resolve(value);
      } else if (input === '\u007f' || input === '\b') {
        value = value.slice(0, -1);
      } else if (!input.startsWith('\u001b') && input >= ' ') {
        value += input;
      }
    };

    process.stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  requireElevatedWindowsAdministrator();

  await ensureCredentialTable();
  const accounts = await listProvisionableAccounts();
  if (accounts.length === 0) {
    throw new Error('No active accounts were found in MySQL table user_profiles. No accounts were changed.');
  }

  process.stdout.write('\nExisting active SchoolCare accounts:\n');
  accounts.forEach((account, index) => {
    const status = account.hasCredential ? ' (already provisioned)' : '';
    process.stdout.write(`${index + 1}. ${account.fullName} <${account.email}> — ${account.roleId}${status}\n`);
  });

  const selection = await askLine('\nSelect an account number to set its initial password: ');
  if (!/^[1-9]\d*$/.test(selection)) {
    throw new Error('Enter one of the listed account numbers.');
  }

  const account = accounts[Number(selection) - 1];
  if (!account) {
    throw new Error('That account number is not in the list. No accounts were changed.');
  }
  if (account.hasCredential) {
    throw new Error('That account already has a password credential. No account or password was changed.');
  }

  const password = await readPassword('Initial password (12–128 characters): ');
  if (password.length < 12 || password.length > 128) {
    throw new Error('Password must be between 12 and 128 characters. No account was changed.');
  }

  const confirmation = await readPassword('Confirm initial password: ');
  if (password !== confirmation) {
    throw new Error('Passwords do not match. No account was changed.');
  }

  try {
    await provisionInitialPassword(account.id, password);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (code === 'ER_DUP_ENTRY') {
      throw new Error('That account was already provisioned. No account or password was changed.');
    }
    throw new Error('Could not save the password hash to MySQL. Check the XAMPP connection and database permissions.');
  }

  process.stdout.write(`Initial password provisioned for ${account.email}. The password was not displayed or logged.\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Account provisioning failed.'}\n`);
  process.exitCode = 1;
});
