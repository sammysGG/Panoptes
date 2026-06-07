'use strict';

// Panoptes module: Install fail2ban
// Installs fail2ban using whichever package manager is present and configures a
// basic sshd jail. Idempotent — re-running simply rewrites the jail and restarts.

async function run(ctx) {
  const { ssh, params, log } = ctx;
  const useSudo = params.useSudo !== false;
  const maxRetry = Number(params.maxRetry) || 5;
  const banTime = Number(params.banTime) || 3600;

  const who = await ssh.exec('id -un');
  const sudo = who.stdout.trim() === 'root' || !useSudo ? '' : 'sudo -n ';

  async function step(title, command) {
    log(`» ${title}`, 'info');
    const r = await ssh.exec(command);
    if (r.code !== 0) throw new Error(`${title} failed (exit ${r.code})`);
    return r;
  }

  // Detect the package manager.
  const pm = (
    await ssh.exec(
      'command -v apt-get >/dev/null && echo apt || ' +
        '(command -v dnf >/dev/null && echo dnf || ' +
        '(command -v yum >/dev/null && echo yum || ' +
        '(command -v pkg >/dev/null && echo pkg || echo none)))'
    )
  ).stdout.trim();
  log(`Detected package manager: ${pm}`, 'info');

  switch (pm) {
    case 'apt':
      await step('Update apt index', `${sudo}apt-get update -y`);
      await step('Install fail2ban', `${sudo}DEBIAN_FRONTEND=noninteractive apt-get install -y fail2ban`);
      break;
    case 'dnf':
      await step('Install fail2ban', `${sudo}dnf install -y fail2ban`);
      break;
    case 'yum':
      await step('Install fail2ban', `${sudo}yum install -y epel-release; ${sudo}yum install -y fail2ban`);
      break;
    case 'pkg':
      await step('Install fail2ban', `${sudo}pkg install -y py39-fail2ban || ${sudo}pkg install -y fail2ban`);
      break;
    default:
      throw new Error('No supported package manager found (apt/dnf/yum/pkg).');
  }

  // Write a basic SSH jail.
  const jail = [
    '# Managed by Panoptes',
    '[sshd]',
    'enabled = true',
    'port = ssh',
    `maxretry = ${maxRetry}`,
    `bantime = ${banTime}`,
    'findtime = 600',
    '',
  ].join('\n');
  const jailEscaped = jail.replace(/'/g, "'\\''");
  await step(
    'Write SSH jail (/etc/fail2ban/jail.d/panoptes-sshd.local)',
    `${sudo}mkdir -p /etc/fail2ban/jail.d && printf '%s' '${jailEscaped}' | ${sudo}tee /etc/fail2ban/jail.d/panoptes-sshd.local > /dev/null`
  );

  // Enable + (re)start the service.
  log('» Enable and start fail2ban', 'info');
  const start = await ssh.exec(
    `${sudo}systemctl enable --now fail2ban 2>/dev/null || ${sudo}service fail2ban restart 2>/dev/null || echo NO_START`
  );
  if (start.stdout.includes('NO_START')) {
    log('Installed, but could not start the service automatically — start fail2ban manually.', 'stderr');
  } else {
    log('fail2ban installed and running with the Panoptes SSH jail.', 'info');
  }
}

module.exports = { run };
