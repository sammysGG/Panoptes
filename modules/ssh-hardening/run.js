'use strict';

// Panoptes module: SSH Hardening
// Runs over an existing SSH connection (ctx.ssh) and applies a hardened sshd
// configuration via a drop-in file, validating with `sshd -t` before reload.

/**
 * @param {import('../../backend/src/types').ModuleContext} ctx
 */
async function run(ctx) {
  const { ssh, params, log } = ctx;
  const useSudo = params.useSudo !== false;

  // Detect whether we are already root; only prefix sudo when needed.
  const who = await ssh.exec('id -un');
  const isRoot = who.stdout.trim() === 'root';
  const sudo = !isRoot && useSudo ? 'sudo -n ' : '';
  if (!isRoot && !useSudo) {
    log('Not running as root and sudo disabled — privileged steps may fail.', 'info');
  }

  // Helper: run a command, log a friendly header, and fail loudly on non-zero.
  async function step(title, command) {
    log(`» ${title}`, 'info');
    const r = await ssh.exec(command);
    if (r.code !== 0) {
      throw new Error(`${title} failed (exit ${r.code})`);
    }
    return r;
  }

  // 1. Install authorized public key, if provided.
  if (params.publicKey && String(params.publicKey).trim()) {
    const key = String(params.publicKey).trim().replace(/'/g, "'\\''");
    await step(
      'Install authorized public key',
      `mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh" && touch "$HOME/.ssh/authorized_keys" && ` +
        `grep -qxF '${key}' "$HOME/.ssh/authorized_keys" || echo '${key}' >> "$HOME/.ssh/authorized_keys"; ` +
        `chmod 600 "$HOME/.ssh/authorized_keys"`
    );
  } else {
    log('No public key supplied — skipping key install.', 'info');
  }

  // 2. Build the hardened sshd drop-in config.
  const lines = ['# Managed by Panoptes — SSH Hardening module'];
  if (params.disablePasswordAuth !== false) {
    lines.push('PasswordAuthentication no', 'ChallengeResponseAuthentication no', 'PubkeyAuthentication yes');
  }
  const root = params.permitRootLogin || 'prohibit-password';
  if (['yes', 'no', 'prohibit-password'].includes(root)) {
    lines.push(`PermitRootLogin ${root}`);
  }
  if (params.sshPort && Number(params.sshPort) > 0) {
    lines.push(`Port ${Number(params.sshPort)}`);
  }
  const conf = lines.join('\n') + '\n';
  const confEscaped = conf.replace(/'/g, "'\\''");

  // Prefer a drop-in directory (modern OpenSSH); fall back to appending to main config.
  const hasDropin = await ssh.exec('test -d /etc/ssh/sshd_config.d && echo yes || echo no');
  if (hasDropin.stdout.trim() === 'yes') {
    await step(
      'Write drop-in config /etc/ssh/sshd_config.d/99-panoptes.conf',
      `printf '%s' '${confEscaped}' | ${sudo}tee /etc/ssh/sshd_config.d/99-panoptes.conf > /dev/null`
    );
  } else {
    await step(
      'Append hardened config to /etc/ssh/sshd_config',
      `${sudo}sh -c "sed -i '/# Managed by Panoptes/,/# End Panoptes/d' /etc/ssh/sshd_config; ` +
        `printf '\\n# Managed by Panoptes\\n%s# End Panoptes\\n' '${confEscaped}' >> /etc/ssh/sshd_config"`
    );
  }

  // 3. Validate the configuration before reloading (prevents lockout).
  await step('Validate sshd configuration (sshd -t)', `${sudo}sshd -t`);

  // 4. Reload sshd. Try systemd first, fall back to service/HUP.
  log('» Reload sshd', 'info');
  const reload = await ssh.exec(
    `${sudo}systemctl reload ssh 2>/dev/null || ${sudo}systemctl reload sshd 2>/dev/null || ` +
      `${sudo}service ssh reload 2>/dev/null || ${sudo}service sshd reload 2>/dev/null || echo NO_RELOAD`
  );
  if (reload.stdout.includes('NO_RELOAD')) {
    log('Could not reload sshd automatically — reload it manually to apply changes.', 'stderr');
  } else {
    log('sshd reloaded. Hardened configuration is active.', 'info');
  }

  if (params.sshPort) {
    log(`Note: SSH now listens on port ${params.sshPort}. Update this system's credential port.`, 'info');
  }
}

module.exports = { run };
