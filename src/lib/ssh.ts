import { readFileSync } from "node:fs";
import { Client, type ConnectConfig } from "ssh2";
import type { SshTarget } from "@/lib/env";

export function createSshConfig(target: SshTarget): ConnectConfig {
  const config: ConnectConfig = {
    host: target.host,
    port: target.port,
    username: target.username,
    readyTimeout: 20_000,
    keepaliveInterval: 10_000,
    keepaliveCountMax: 3,
    hostVerifier: () => target.strictHostKeyChecking !== "yes",
  };

  if (target.keyFile) {
    config.privateKey = readFileSync(target.keyFile);
    if (target.passphrase) {
      config.passphrase = target.passphrase;
    }
  }

  if (target.password) {
    config.password = target.password;
  }

  return config;
}

export function connectSsh(target: SshTarget): Promise<Client> {
  const client = new Client();
  const config = createSshConfig(target);

  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      client.removeAllListeners("ready");
      reject(error);
    };

    client.once("ready", () => {
      client.removeListener("error", onError);
      resolve(client);
    });
    client.once("error", onError);
    client.connect(config);
  });
}

export function execCommand(
  client: Client,
  command: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    client.exec(command, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      stream.on("data", (chunk: Buffer) => stdout.push(chunk));
      stream.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      stream.on("close", (code: number | null) => {
        resolve({
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          code: code ?? 0,
        });
      });
      stream.on("error", reject);
    });
  });
}
