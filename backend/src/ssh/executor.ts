import { Client, ConnectConfig } from 'ssh2';
import { LogStream, SshHandle } from '../types';
import { ResolvedCredential } from '../credentials';

export interface ConnectOptions {
  host: string;
  cred: ResolvedCredential;
  log: (line: string, stream?: LogStream) => void;
  readyTimeoutMs?: number;
}

// Open an ssh2 connection from a resolved credential and hand back an SshHandle
// that modules use to run commands and push files. The handle streams command
// output line-by-line through the provided log() callback.
export function connect(opts: ConnectOptions): Promise<{ handle: SshHandle; close: () => void }> {
  const { host, cred, log } = opts;
  const conn = new Client();

  const connectConfig: ConnectConfig = {
    host,
    port: cred.port,
    username: cred.username,
    readyTimeout: opts.readyTimeoutMs ?? 15000,
    // Lab/range hosts frequently have changing or self-signed host keys; the
    // operator has explicitly targeted them, so we accept the presented key.
    algorithms: undefined,
  };
  if (cred.authType === 'password') {
    connectConfig.password = cred.secret;
  } else {
    connectConfig.privateKey = cred.secret;
    if (cred.passphrase) connectConfig.passphrase = cred.passphrase;
  }

  return new Promise((resolve, reject) => {
    conn.on('ready', () => {
      const handle: SshHandle = {
        exec(command: string) {
          return new Promise((res, rej) => {
            conn.exec(command, (err, stream) => {
              if (err) return rej(err);
              let stdout = '';
              let stderr = '';
              let stdoutBuf = '';
              let stderrBuf = '';
              const flush = (buf: string, stream: LogStream): string => {
                const parts = buf.split('\n');
                const rest = parts.pop() ?? '';
                for (const line of parts) log(line, stream);
                return rest;
              };
              stream.on('data', (d: Buffer) => {
                const s = d.toString();
                stdout += s;
                stdoutBuf = flush(stdoutBuf + s, 'stdout');
              });
              stream.stderr.on('data', (d: Buffer) => {
                const s = d.toString();
                stderr += s;
                stderrBuf = flush(stderrBuf + s, 'stderr');
              });
              stream.on('close', (code: number) => {
                if (stdoutBuf) log(stdoutBuf, 'stdout');
                if (stderrBuf) log(stderrBuf, 'stderr');
                res({ code: code ?? 0, stdout, stderr });
              });
            });
          });
        },
        putFile(remotePath: string, content: string, mode = 0o600) {
          return new Promise((res, rej) => {
            conn.sftp((err, sftp) => {
              if (err) return rej(err);
              const ws = sftp.createWriteStream(remotePath, { mode });
              ws.on('close', () => res());
              ws.on('error', rej);
              ws.end(content);
            });
          });
        },
      };
      resolve({ handle, close: () => conn.end() });
    });
    conn.on('error', (err) => reject(err));
    conn.connect(connectConfig);
  });
}
