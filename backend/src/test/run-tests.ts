/* Lightweight self-tests for Panoptes's core engine. Run with `npm test`.
   No external test framework — just assertions and a tiny runner. */
import assert from 'assert';
import path from 'path';
import { encrypt, decrypt } from '../crypto';
import { expandTargets } from '../scanner/cidr';
import { parseNmapXml } from '../scanner/nmap';
import { ModuleContext, SshHandle } from '../types';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${(e as Error).message}`);
  }
}

// A mock SSH handle that records commands and returns scripted responses.
function mockSsh(): { handle: SshHandle; commands: string[]; files: Record<string, string> } {
  const commands: string[] = [];
  const files: Record<string, string> = {};
  const handle: SshHandle = {
    async exec(command: string) {
      commands.push(command);
      // Emulate just enough behaviour for the hardening modules.
      if (command === 'id -un') return { code: 0, stdout: 'root\n', stderr: '' };
      if (command.includes('sshd_config.d')) return { code: 0, stdout: 'yes\n', stderr: '' };
      if (command.includes('command -v apt-get')) return { code: 0, stdout: 'apt\n', stderr: '' };
      if (command.includes('sshd -t')) return { code: 0, stdout: '', stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    },
    async putFile(remotePath: string, content: string) {
      files[remotePath] = content;
    },
  };
  return { handle, commands, files };
}

async function main(): Promise<void> {
  console.log('Panoptes engine self-tests\n');

  await test('crypto: encrypt/decrypt roundtrip', () => {
    const secret = 'super-secret-ssh-key-PEM\nwith newlines';
    const sealed = encrypt(secret);
    assert.notStrictEqual(sealed.enc, secret);
    assert.strictEqual(decrypt(sealed), secret);
  });

  await test('cidr: /30 expands to 2 usable hosts', () => {
    const hosts = expandTargets('192.168.1.0/30');
    assert.deepStrictEqual(hosts, ['192.168.1.1', '192.168.1.2']);
  });

  await test('cidr: /32 is a single host', () => {
    assert.deepStrictEqual(expandTargets('10.0.0.5/32'), ['10.0.0.5']);
  });

  await test('cidr: range form', () => {
    assert.deepStrictEqual(expandTargets('10.0.0.1-10.0.0.3'), [
      '10.0.0.1',
      '10.0.0.2',
      '10.0.0.3',
    ]);
  });

  await test('nmap: parse XML into hosts/ports', () => {
    const xml = `<?xml version="1.0"?><nmaprun><host><status state="up"/>
      <address addr="10.0.0.10" addrtype="ipv4"/>
      <hostnames><hostname name="dc01"/></hostnames>
      <os><osmatch name="Microsoft Windows Server 2019"/></os>
      <ports>
        <port protocol="tcp" portid="88"><state state="open"/><service name="kerberos"/></port>
        <port protocol="tcp" portid="389"><state state="open"/><service name="ldap"/></port>
      </ports></host></nmaprun>`;
    const hosts = parseNmapXml(xml);
    assert.strictEqual(hosts.length, 1);
    assert.strictEqual(hosts[0].ip, '10.0.0.10');
    assert.strictEqual(hosts[0].hostname, 'dc01');
    assert.ok(hosts[0].osGuess?.includes('Windows'));
    assert.strictEqual(hosts[0].ports.length, 2);
  });

  // Classification depends on the DB/definitions; exercise it through a temp DB.
  await test('classify: Windows DC beats Linux on AD ports', async () => {
    process.env.PANOPTES_DB_PATH = path.join(__dirname, 'test.sqlite');
    require('fs').rmSync(process.env.PANOPTES_DB_PATH, { force: true });
    const { seedDefinitions } = require('../definitions');
    const { classifyHost } = require('../scanner/classify');
    seedDefinitions();
    const result = classifyHost({
      ip: '10.0.0.10',
      osGuess: 'Microsoft Windows Server 2019',
      ports: [
        { port: 88, protocol: 'tcp', state: 'open', service: 'kerberos' },
        { port: 389, protocol: 'tcp', state: 'open', service: 'ldap' },
        { port: 445, protocol: 'tcp', state: 'open', service: 'microsoft-ds' },
        { port: 3389, protocol: 'tcp', state: 'open', service: 'ms-wbt-server' },
      ],
    });
    assert.strictEqual(result.definitionId, 'windows-dc');
  });

  await test('module engine: ssh-hardening applies expected commands', async () => {
    const runPath = path.resolve(__dirname, '..', '..', '..', 'modules', 'ssh-hardening', 'run.js');
    delete require.cache[require.resolve(runPath)];
    const mod = require(runPath);
    const { handle, commands } = mockSsh();
    const logs: string[] = [];
    const ctx: ModuleContext = {
      ssh: handle,
      params: { publicKey: 'ssh-ed25519 AAAATESTKEY user@host', disablePasswordAuth: true },
      system: { id: 1, ip: '127.0.0.1' },
      log: (line) => logs.push(line),
    };
    await mod.run(ctx);
    const joined = commands.join('\n');
    assert.ok(joined.includes('authorized_keys'), 'installs the key');
    assert.ok(joined.includes('PasswordAuthentication no'), 'disables password auth');
    assert.ok(joined.includes('sshd -t'), 'validates config');
    assert.ok(commands.some((c) => c.includes('reload')), 'reloads sshd');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
