'use strict';

// Panoptes module: RDP / Windows Hardening (placeholder)
// Windows-native hardening runs over WinRM/PowerShell remoting, which is not yet
// wired into Panoptes. The runner short-circuits experimental winrm modules, so
// this run() exists to document the intended steps and keep the manifest valid.

async function run(ctx) {
  const { log } = ctx;
  log('RDP hardening requires WinRM remoting (coming soon).', 'info');
  log('Planned steps once WinRM lands:', 'info');
  log('  1. Set fDenyTSConnections=0 and UserAuthentication=1 (require NLA).', 'info');
  log('  2. Scope the "Remote Desktop" firewall rule to management subnets.', 'info');
  log('  3. Restrict RDP access to the Remote Desktop Users group.', 'info');
  log('  4. Apply an account lockout policy (threshold + duration).', 'info');
  throw new Error('WinRM remoting not yet supported in this build.');
}

module.exports = { run };
