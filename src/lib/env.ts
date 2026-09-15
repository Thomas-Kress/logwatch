import { z } from "zod";
import { UPDATE_INTERVAL_MS } from "@/lib/data-window";
import { expandHome } from "@/lib/utils";

const optionalString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed.length > 0 ? trimmed : undefined;
  });

const hostKeyChecking = z.enum(["yes", "no", "accept-new"]).default("accept-new");

const envSchema = z.object({
  SSH_HOST: z.string().trim().min(1, "SSH_HOST is required"),
  SSH_USERNAME: z.string().trim().min(1, "SSH_USERNAME is required"),
  SSH_PASSWORD: optionalString,
  SSH_KEY_FILE: optionalString,
  SSH_PASSPHRASE: optionalString,
  SSH_PORT: z.coerce.number().int().positive().default(22),
  SSH_KNOWN_HOSTS: optionalString,
  SSH_STRICT_HOST_KEY_CHECKING: hostKeyChecking,
  SSH2_HOST: optionalString,
  SSH2_USERNAME: optionalString,
  SSH2_PASSWORD: optionalString,
  SSH2_KEY_FILE: optionalString,
  SSH2_PASSPHRASE: optionalString,
  SSH2_PORT: z.preprocess(
    (value) => (value === undefined || value === "" ? undefined : value),
    z.coerce.number().int().positive().optional(),
  ),
  SSH2_KNOWN_HOSTS: optionalString,
  SSH2_STRICT_HOST_KEY_CHECKING: z.enum(["yes", "no", "accept-new"]).optional(),
  FILE_PATH: z.string().trim().min(1, "FILE_PATH is required"),
  FILE_PATTERN: z.string().trim().min(1, "FILE_PATTERN is required"),
  TAIL_LINES: z.coerce.number().int().positive().default(200),
  FILE_REFRESH_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15000)
    .transform((value) => Math.min(value, UPDATE_INTERVAL_MS)),
  ALERT_ERROR_PER_MIN: z.coerce.number().int().nonnegative().default(5),
  ALERT_WARN_PER_MIN: z.coerce.number().int().nonnegative().default(30),
  ALERT_INCLUDE_TRACES: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type SshTarget = {
  id: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  keyFile?: string;
  passphrase?: string;
  knownHosts?: string;
  strictHostKeyChecking: "yes" | "no" | "accept-new";
};

export type AppEnv = z.infer<typeof envSchema> & {
  SSH_KEY_FILE?: string;
  SSH_KNOWN_HOSTS?: string;
  SSH2_KEY_FILE?: string;
  SSH2_KNOWN_HOSTS?: string;
  sshTargets: SshTarget[];
};

let cached: AppEnv | undefined;

function requireAuth(label: string, password?: string, keyFile?: string) {
  if (!password && !keyFile) {
    throw new Error(`Set ${label}_PASSWORD or ${label}_KEY_FILE in .env`);
  }
}

function sshTargetFromPrimary(data: z.infer<typeof envSchema>): SshTarget {
  requireAuth("SSH", data.SSH_PASSWORD, data.SSH_KEY_FILE);
  return {
    id: "1",
    host: data.SSH_HOST,
    port: data.SSH_PORT,
    username: data.SSH_USERNAME,
    password: data.SSH_PASSWORD,
    keyFile: data.SSH_KEY_FILE,
    passphrase: data.SSH_PASSPHRASE,
    knownHosts: data.SSH_KNOWN_HOSTS,
    strictHostKeyChecking: data.SSH_STRICT_HOST_KEY_CHECKING,
  };
}

function sshTargetFromSecondary(
  data: z.infer<typeof envSchema>,
): SshTarget | undefined {
  if (!data.SSH2_HOST) {
    return undefined;
  }
  if (!data.SSH2_USERNAME) {
    throw new Error("SSH2_USERNAME is required when SSH2_HOST is set");
  }
  requireAuth("SSH2", data.SSH2_PASSWORD, data.SSH2_KEY_FILE);
  const target: SshTarget = {
    id: "2",
    host: data.SSH2_HOST,
    port: data.SSH2_PORT ?? data.SSH_PORT,
    username: data.SSH2_USERNAME,
    password: data.SSH2_PASSWORD,
    keyFile: data.SSH2_KEY_FILE,
    passphrase: data.SSH2_PASSPHRASE,
    knownHosts: data.SSH2_KNOWN_HOSTS ?? data.SSH_KNOWN_HOSTS,
    strictHostKeyChecking:
      data.SSH2_STRICT_HOST_KEY_CHECKING ?? data.SSH_STRICT_HOST_KEY_CHECKING,
  };
  if (target.host === data.SSH_HOST && target.port === data.SSH_PORT) {
    throw new Error("SSH2_HOST must differ from SSH_HOST for a two-server setup");
  }
  return target;
}

export function getEnv(): AppEnv {
  if (cached) {
    return cached;
  }

  const parsed = envSchema.safeParse({
    SSH_HOST: process.env.SSH_HOST,
    SSH_USERNAME: process.env.SSH_USERNAME,
    SSH_PASSWORD: process.env.SSH_PASSWORD,
    SSH_KEY_FILE: process.env.SSH_KEY_FILE,
    SSH_PASSPHRASE: process.env.SSH_PASSPHRASE,
    SSH_PORT: process.env.SSH_PORT ?? "22",
    SSH_KNOWN_HOSTS: process.env.SSH_KNOWN_HOSTS,
    SSH_STRICT_HOST_KEY_CHECKING:
      process.env.SSH_STRICT_HOST_KEY_CHECKING ?? "accept-new",
    SSH2_HOST: process.env.SSH2_HOST,
    SSH2_USERNAME: process.env.SSH2_USERNAME,
    SSH2_PASSWORD: process.env.SSH2_PASSWORD,
    SSH2_KEY_FILE: process.env.SSH2_KEY_FILE,
    SSH2_PASSPHRASE: process.env.SSH2_PASSPHRASE,
    SSH2_PORT: process.env.SSH2_PORT?.trim() || undefined,
    SSH2_KNOWN_HOSTS: process.env.SSH2_KNOWN_HOSTS,
    SSH2_STRICT_HOST_KEY_CHECKING:
      process.env.SSH2_STRICT_HOST_KEY_CHECKING?.trim() || undefined,
    FILE_PATH: process.env.FILE_PATH,
    FILE_PATTERN: process.env.FILE_PATTERN,
    TAIL_LINES: process.env.TAIL_LINES ?? "200",
    FILE_REFRESH_MS: process.env.FILE_REFRESH_MS ?? "15000",
    ALERT_ERROR_PER_MIN: process.env.ALERT_ERROR_PER_MIN ?? "5",
    ALERT_WARN_PER_MIN: process.env.ALERT_WARN_PER_MIN ?? "30",
    ALERT_INCLUDE_TRACES: process.env.ALERT_INCLUDE_TRACES ?? "false",
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid .env configuration (${details})`);
  }

  const data = {
    ...parsed.data,
    SSH_KEY_FILE: parsed.data.SSH_KEY_FILE
      ? expandHome(parsed.data.SSH_KEY_FILE)
      : undefined,
    SSH_KNOWN_HOSTS: parsed.data.SSH_KNOWN_HOSTS
      ? expandHome(parsed.data.SSH_KNOWN_HOSTS)
      : undefined,
    SSH2_KEY_FILE: parsed.data.SSH2_KEY_FILE
      ? expandHome(parsed.data.SSH2_KEY_FILE)
      : undefined,
    SSH2_KNOWN_HOSTS: parsed.data.SSH2_KNOWN_HOSTS
      ? expandHome(parsed.data.SSH2_KNOWN_HOSTS)
      : undefined,
  };

  const primary = sshTargetFromPrimary(data);
  const secondary = sshTargetFromSecondary(data);
  const sshTargets = secondary ? [primary, secondary] : [primary];

  cached = {
    ...data,
    sshTargets,
  };

  return cached;
}

export function publicEnv() {
  const env = getEnv();
  const servers = env.sshTargets.map((target) => ({
    id: target.id,
    host: target.host,
    port: target.port,
  }));
  return {
    host: servers.map((server) => server.host).join(" · "),
    port: servers[0]?.port ?? env.SSH_PORT,
    path: env.FILE_PATH,
    pattern: env.FILE_PATTERN,
    servers,
  };
}
