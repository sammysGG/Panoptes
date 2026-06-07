# Panoptes

**Panoptes** is a blue-team console for Red-vs-Blue exercises. Point it at the network
you've been allocated and it will:

1. **Scan** the range (nmap when available, with a pure-Node TCP-sweep fallback).
2. **Classify** discovered hosts into **system definitions** — Windows DC, Windows
   workstation, mail server, Linux server, pfSense, and any you add yourself.
3. **Board** them as cards with the **hardening tasks** that apply to each type.
4. **Apply** hardening with a click: Panoptes SSHes in and runs modular tasks — install an
   authorized key, disable password auth, lock down root, install fail2ban, and more — with
   live output streamed to the UI.

Tasks are **modules**, so you can write your own and drop them in.

> ⚠️ Panoptes performs authenticated changes to hosts and stores SSH credentials (encrypted
> at rest). Use it only against systems you are authorised to harden — your own exercise range.

---

## Architecture

| Part | Stack |
| --- | --- |
| `frontend/` | Next.js 15 · React 19 · MUI 7 (based on the MIT [Material Kit React](https://github.com/devias-io/material-kit-react)) |
| `backend/` | Node + Express + Socket.IO (TypeScript) · `ssh2` · `better-sqlite3` · nmap |
| `modules/` | Drop-in hardening modules (`module.json` + `run.js`) |
| `system-definitions/` | JSON classification rules + default modules per system type |

The backend exposes a JWT-protected REST API plus a Socket.IO channel for live scan progress
and task output. Target credentials are encrypted with AES-256-GCM (key derived from
`PANOPTES_SECRET_KEY`) and are never returned to the browser.

## Deploy (one machine, from GitHub)

On a fresh Linux host (Debian/Ubuntu or RHEL family), as root or with sudo:

```bash
curl -fsSL https://raw.githubusercontent.com/sammysGG/Panoptes/main/install.sh | sudo bash
```

The installer provisions Node 20, nmap and build tools, clones the repo to `/opt/panoptes`,
builds both apps, generates a random secret + `.env`, and starts `panoptes-backend` and
`panoptes-frontend` as systemd services. When it finishes it prints the UI URL and login.

Then browse to `http://<server-ip>:3000` and sign in (default `admin` / `panoptes` — change
`PANOPTES_ADMIN_PASS` in `/opt/panoptes/.env`).

### Useful overrides

```bash
PANOPTES_DIR=/srv/panoptes PANOPTES_ADMIN_PASS='s3cret' FRONTEND_PORT=8080 \
  sudo -E bash install.sh
NO_SERVICE=1 sudo -E bash install.sh   # build only, start manually
```

## Run locally (dev)

```bash
# backend
cd backend && npm install && npm run dev      # http://localhost:4000
# frontend (new shell)
cd frontend && npm install && npm run dev      # http://localhost:3000
```

`npm test` in `backend/` runs the engine self-tests (crypto, CIDR, nmap parsing,
classification, and the module runner against a mock SSH handle).

## Writing a module

A module is a folder under `modules/`:

```
modules/my-module/
  module.json   # manifest: id, name, params, appliesTo, ...
  run.js        # module.exports = { async run({ ssh, params, system, log }) {...} }
```

`run.js` receives an SSH handle (`ssh.exec(cmd)`, `ssh.putFile(path, content)`), the
user-supplied `params`, the target `system`, and a `log(line, stream)` that streams to the UI.
Throw to mark the task failed. See `modules/ssh-hardening` and `modules/fail2ban-install` for
working examples. Add a module by dropping the folder into `modules/` (hot-loaded) or uploading
a `.zip` from the **Modules** page.

## Adding a system definition

Drop a JSON file in `system-definitions/` (see the shipped ones). `match` rules score a host on
open ports, OS fingerprint, and service banners; the highest score wins. `defaultModuleIds`
lists the hardening modules suggested for that type.

## Roadmap

- WinRM/PowerShell remoting for native Windows hardening (the `rdp-hardening` module and Windows
  definitions are present today as planning placeholders).
- In-UI editing of system definitions.
- Per-task scheduling and bulk runs across a whole system group.

## License

MIT. The UI is derived from Devias IO's Material Kit React (MIT). See [LICENSE](./LICENSE).
