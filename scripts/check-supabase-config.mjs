#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

const ENV_FILE = process.argv.includes("--migration") ? ".env.migration" : ".env";
const CHECK_ONLINE = process.argv.includes("--online");

function parseEnv(contents) {
  const values = {};

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;

    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function describeKey(value) {
  if (!value) return "missing";
  if (value.startsWith("sb_publishable_")) return "publishable";
  if (value.startsWith("sb_secret_")) return "secret";
  if (value.split(".").length === 3) return "legacy-jwt";
  return "unknown";
}

function addError(errors, message) {
  errors.push(message);
  console.error(`✖ ${message}`);
}

function addSuccess(message) {
  console.log(`✓ ${message}`);
}

async function checkApplicationEnv(env) {
  const errors = [];
  const warnings = [];
  const expectedRef = "nrtdhkjeziknmafauypv";
  const expectedUrl = `https://${expectedRef}.supabase.co`;
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
  const elevatedKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  if (env.SUPABASE_PROJECT_ID !== expectedRef) {
    addError(errors, `SUPABASE_PROJECT_ID must be ${expectedRef}.`);
  } else {
    addSuccess("New Supabase project ID is configured.");
  }

  if (env.SUPABASE_URL !== expectedUrl || env.VITE_SUPABASE_URL !== expectedUrl) {
    addError(errors, `SUPABASE_URL and VITE_SUPABASE_URL must both be ${expectedUrl}.`);
  } else {
    addSuccess("Client and server URLs point to the new project.");
  }

  if (describeKey(publishableKey) !== "publishable" && describeKey(publishableKey) !== "legacy-jwt") {
    addError(errors, "A publishable key (or legacy anon JWT) is required for the browser client.");
  } else {
    addSuccess("Browser publishable key format is valid.");
  }

  if (env.VITE_SUPABASE_PUBLISHABLE_KEY !== env.SUPABASE_PUBLISHABLE_KEY) {
    addError(errors, "VITE_SUPABASE_PUBLISHABLE_KEY and SUPABASE_PUBLISHABLE_KEY must match.");
  } else {
    addSuccess("Browser and server publishable keys match.");
  }

  const elevatedType = describeKey(elevatedKey);
  if (!elevatedKey) {
    warnings.push("Server admin key is not configured yet. Admin, backup, and migration operations will remain disabled.");
  } else if (elevatedType === "publishable") {
    addError(errors, "A publishable key cannot be used as SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  } else if (elevatedType !== "secret" && elevatedType !== "legacy-jwt") {
    addError(errors, "Server admin key has an unsupported format.");
  } else {
    addSuccess("Server admin key format is valid.");
  }

  for (const warning of warnings) console.warn(`⚠ ${warning}`);

  if (CHECK_ONLINE && errors.length === 0) {
    try {
      const response = await fetch(`${expectedUrl}/rest/v1/`, {
        headers: { apikey: publishableKey },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        addError(errors, `Online Supabase check returned HTTP ${response.status}.`);
      } else {
        addSuccess("Online Supabase REST check succeeded.");
      }
    } catch (error) {
      warnings.push(`Online check could not run: ${error instanceof Error ? error.message : String(error)}`);
      console.warn(`⚠ ${warnings.at(-1)}`);
    }
  }

  return errors.length === 0;
}

async function checkMigrationEnv(env) {
  const errors = [];
  const required = [
    "OLD_SUPABASE_DB_URL",
    "OLD_SUPABASE_SERVICE_ROLE_KEY",
    "NEW_SUPABASE_DB_URL",
  ];

  for (const key of required) {
    if (!env[key]) addError(errors, `${key} is not configured.`);
  }

  const newElevatedKey = env.NEW_SUPABASE_SECRET_KEY || env.NEW_SUPABASE_SERVICE_ROLE_KEY;
  if (!newElevatedKey) {
    addError(errors, "NEW_SUPABASE_SECRET_KEY or NEW_SUPABASE_SERVICE_ROLE_KEY is required.");
  } else if (describeKey(newElevatedKey) === "publishable") {
    addError(errors, "The new migration admin key cannot be a publishable key.");
  }

  if (env.MIGRATION_DRY_RUN !== "true") {
    addError(errors, "MIGRATION_DRY_RUN must remain true during the first connection check.");
  }

  if (errors.length === 0) addSuccess("Migration credentials are ready for a dry run.");
  return errors.length === 0;
}

async function main() {
  let contents;
  try {
    contents = await readFile(ENV_FILE, "utf8");
  } catch {
    console.error(`✖ ${ENV_FILE} was not found.`);
    console.error(
      ENV_FILE === ".env"
        ? "  Copy .env.example to .env first."
        : "  Copy .env.migration.example to .env.migration first.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Checking ${ENV_FILE} without printing credential values...`);
  const env = parseEnv(contents);
  const ok = ENV_FILE === ".env" ? await checkApplicationEnv(env) : await checkMigrationEnv(env);
  process.exitCode = ok ? 0 : 1;
}

await main();
