#!/usr/bin/env node
/**
 * Install agentdeck skills + slash commands into the user's Claude Code
 * config (`~/.claude/skills/<name>/SKILL.md` and `~/.claude/commands/<name>.md`).
 *
 * Idempotent: re-running overwrites the existing files.
 *
 * Sources of truth live in the repo:
 *   process/skills/<name>/SKILL.md   → ~/.claude/skills/<name>/SKILL.md
 *   process/commands/<name>.md       → ~/.claude/commands/<name>.md
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const claudeHome = join(homedir(), '.claude');

const SRC_SKILLS = join(repoRoot, 'process', 'skills');
const SRC_COMMANDS = join(repoRoot, 'process', 'commands');
const DST_SKILLS = join(claudeHome, 'skills');
const DST_COMMANDS = join(claudeHome, 'commands');

function log(msg) {
  process.stdout.write(`[install-skills] ${msg}\n`);
}

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function installSkills() {
  if (!existsSync(SRC_SKILLS)) {
    log(`no skills source dir at ${SRC_SKILLS} — skipping`);
    return 0;
  }
  ensureDir(DST_SKILLS);
  let count = 0;
  for (const name of readdirSync(SRC_SKILLS)) {
    const srcDir = join(SRC_SKILLS, name);
    if (!statSync(srcDir).isDirectory()) continue;
    const srcFile = join(srcDir, 'SKILL.md');
    if (!existsSync(srcFile)) {
      log(`skipping ${name}: no SKILL.md at ${srcFile}`);
      continue;
    }
    const dstDir = join(DST_SKILLS, name);
    ensureDir(dstDir);
    const dstFile = join(dstDir, 'SKILL.md');
    copyFileSync(srcFile, dstFile);
    log(`installed skill: ${name} → ${dstFile}`);
    count++;
  }
  return count;
}

function installCommands() {
  if (!existsSync(SRC_COMMANDS)) {
    log(`no commands source dir at ${SRC_COMMANDS} — skipping`);
    return 0;
  }
  ensureDir(DST_COMMANDS);
  let count = 0;
  for (const name of readdirSync(SRC_COMMANDS)) {
    if (!name.endsWith('.md')) continue;
    const srcFile = join(SRC_COMMANDS, name);
    const dstFile = join(DST_COMMANDS, name);
    copyFileSync(srcFile, dstFile);
    log(`installed command: /${name.replace(/\.md$/, '')} → ${dstFile}`);
    count++;
  }
  return count;
}

function main() {
  const skills = installSkills();
  const commands = installCommands();
  log('');
  log(`done — ${skills} skill${skills !== 1 ? 's' : ''}, ${commands} command${commands !== 1 ? 's' : ''} installed.`);
  log('');
  log('Try them:');
  log('  claude -p "/agentdeck-self-test" --permission-mode bypassPermissions --allowed-tools "mcp__agentdeck__*"');
  log('');
  log('Or, after starting `claude`, type:');
  log('  /agentdeck-self-test');
  log('');
  log('Or trigger the agentdeck-run skill organically by saying:');
  log('  "Use agentdeck. Then audit the api inventory of $project."');
}

main();
