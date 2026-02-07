#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const kitRoot = path.resolve(__dirname, '..');

const MANAGED_TAG = '<!-- managed-by: shared-agent-kit -->';
const SUPPORTED_SOURCE_FILES = new Set(['AGENTS.md', 'CLAUDE.md']);
const CONFIG_DIR_NAME = '.shared-agent-kit';
const CONFIG_FILE_NAME = 'config.json';
const GITIGNORE_ENTRY = '.shared-agent-kit/';
const DEFAULT_SKILLS = ['./.agent-kit/skills/'];

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function pathExists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

function ensureDir(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
}

function configFilePath(repoRoot) {
  return path.join(repoRoot, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

function validateSourceFile(sourceFile) {
  if (!SUPPORTED_SOURCE_FILES.has(sourceFile)) {
    throw new Error(`Unsupported source value: ${sourceFile}. Use AGENTS.md or CLAUDE.md.`);
  }
}

function normalizeSkills(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  const cleaned = input
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0)
    .map((item) => {
      const noTrailing = item.replace(/\/+$/, '');
      if (noTrailing.startsWith('./') || noTrailing.startsWith('../')) {
        return `${noTrailing}/`;
      }
      return `./${noTrailing}/`;
    });

  return Array.from(new Set(cleaned));
}

function parseCliSkills(value) {
  if (!value) {
    return undefined;
  }

  const list = String(value)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return normalizeSkills(list);
}

function ensureSkillsRequired(skills) {
  if (skills.length === 0) {
    throw new Error('At least one skills path is required. Use --skills or config.skills.');
  }
}

function readConfig(repoRoot) {
  const file = configFilePath(repoRoot);
  if (!pathExists(file)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new Error(`Invalid JSON config: ${file}`);
  }
}

function writeConfig(repoRoot, nextConfig) {
  const file = configFilePath(repoRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
}

function resolveSettings(repoRoot, cliSource, cliSkills) {
  const cfg = readConfig(repoRoot);
  const sourceFile = String(cliSource ?? cfg.source ?? 'AGENTS.md');
  validateSourceFile(sourceFile);

  const cfgSkills = normalizeSkills(cfg.skills);
  const effectiveSkills = cliSkills ?? (cfgSkills.length > 0 ? cfgSkills : DEFAULT_SKILLS);
  ensureSkillsRequired(effectiveSkills);

  return { sourceFile, skills: effectiveSkills };
}

function ensureConfig(repoRoot, settings) {
  const current = readConfig(repoRoot);
  const next = {
    ...current,
    source: settings.sourceFile,
    skills: settings.skills,
  };
  writeConfig(repoRoot, next);
}

function ensureGitignore(repoRoot) {
  const gitignore = path.join(repoRoot, '.gitignore');
  if (!pathExists(gitignore)) {
    fs.writeFileSync(gitignore, `${GITIGNORE_ENTRY}\n`, 'utf8');
    return;
  }

  const content = fs.readFileSync(gitignore, 'utf8');
  const lines = content.split(/\r?\n/);
  if (lines.includes(GITIGNORE_ENTRY)) {
    return;
  }

  const suffix = content.endsWith('\n') || content.length === 0 ? '' : '\n';
  fs.writeFileSync(gitignore, `${content}${suffix}${GITIGNORE_ENTRY}\n`, 'utf8');
}

function renderList(items) {
  return items.map((item) => `- \`${item}\``).join('\n');
}

function renderSourceBridge(targetName, sourceFile, skills) {
  return `${MANAGED_TAG}\n# ${targetName} 共用入口\n\n本檔案為轉接入口，請優先讀取：\n- \`./${sourceFile}\`\n\nSkills 路徑：\n${renderList(skills)}\n`;
}

function renderCursorRule(sourceFile, skills) {
  return `${MANAGED_TAG}\n---\ndescription: Shared agent rules\nglobs:\nalwaysApply: true\n---\n\n# 共用 Agent 規範\n\n請先載入：\n- \`./${sourceFile}\`\n\nSkills 路徑：\n${renderList(skills)}\n`;
}

function renderOpenCodeEntry(sourceFile, skills) {
  const mapped = skills.map((item) => `../${item.replace(/^\.\//, '')}`);
  return `${MANAGED_TAG}\n# OpenCode 共用入口\n\n請先讀取：\n- \`../${sourceFile}\`\n\nSkills 路徑：\n${renderList(mapped)}\n`;
}

function renderSourceTemplate(sourceFile, skills) {
  return `# ${sourceFile}\n\n請在此定義你的主要 agent system 規範。\n\nSkills 路徑：\n${renderList(skills)}\n`;
}

function isSharedSkillsPath(skillPath) {
  return skillPath.startsWith('./.agent-kit/') || skillPath.startsWith('../.agent-kit/');
}

function writeManagedFile(file, content, force = false) {
  if (pathExists(file)) {
    const existing = fs.readFileSync(file, 'utf8');
    const isManaged = existing.includes(MANAGED_TAG);
    if (!isManaged && !force) {
      throw new Error(`Skip existing unmanaged file: ${file}`);
    }
  }
  ensureDir(file);
  fs.writeFileSync(file, content, 'utf8');
}

function createOrRefreshSymlink(repoRoot, force = false) {
  const targetLink = path.join(repoRoot, '.agent-kit');
  const relativeSource = path.relative(repoRoot, kitRoot) || '.';

  if (pathExists(targetLink)) {
    const stat = fs.lstatSync(targetLink);
    if (!stat.isSymbolicLink()) {
      if (!force) {
        throw new Error(`Skip non-symlink path: ${targetLink}`);
      }
      fs.rmSync(targetLink, { recursive: true, force: true });
    } else {
      fs.unlinkSync(targetLink);
    }
  }

  fs.symlinkSync(relativeSource, targetLink, 'dir');
}

function ensureSourceFile(repoRoot, sourceFile, skills) {
  const sourcePath = path.join(repoRoot, sourceFile);
  if (pathExists(sourcePath)) {
    return;
  }

  ensureDir(sourcePath);
  fs.writeFileSync(sourcePath, renderSourceTemplate(sourceFile, skills), 'utf8');
}

function ensureSkillsDirs(repoRoot, skills) {
  for (const skillPath of skills) {
    if (isSharedSkillsPath(skillPath)) {
      continue;
    }
    const absolute = path.resolve(repoRoot, skillPath);
    fs.mkdirSync(absolute, { recursive: true });
  }
}

function link(repoRoot, settings, force = false) {
  ensureConfig(repoRoot, settings);
  ensureGitignore(repoRoot);
  ensureSourceFile(repoRoot, settings.sourceFile, settings.skills);
  createOrRefreshSymlink(repoRoot, force);
  ensureSkillsDirs(repoRoot, settings.skills);

  if (settings.sourceFile !== 'AGENTS.md') {
    writeManagedFile(path.join(repoRoot, 'AGENTS.md'), renderSourceBridge('Codex', settings.sourceFile, settings.skills), force);
  }

  if (settings.sourceFile !== 'CLAUDE.md') {
    writeManagedFile(path.join(repoRoot, 'CLAUDE.md'), renderSourceBridge('Claude', settings.sourceFile, settings.skills), force);
  }

  writeManagedFile(path.join(repoRoot, '.cursor', 'rules', '00-shared-agent.mdc'), renderCursorRule(settings.sourceFile, settings.skills), force);
  writeManagedFile(path.join(repoRoot, '.opencode', 'AGENTS.md'), renderOpenCodeEntry(settings.sourceFile, settings.skills), force);
}

function check(repoRoot, settings) {
  ensureSkillsRequired(settings.skills);
  const localSkills = settings.skills.filter((item) => !isSharedSkillsPath(item));

  const required = [
    path.join(repoRoot, CONFIG_DIR_NAME),
    configFilePath(repoRoot),
    path.join(repoRoot, '.agent-kit'),
    path.join(repoRoot, settings.sourceFile),
    path.join(repoRoot, '.cursor', 'rules', '00-shared-agent.mdc'),
    path.join(repoRoot, '.opencode', 'AGENTS.md'),
    ...localSkills.map((item) => path.resolve(repoRoot, item)),
  ];

  const missing = required.filter((file) => !pathExists(file));
  if (missing.length > 0) {
    throw new Error(`Missing files:\n${missing.join('\n')}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] ?? 'link';
  const repo = args.repo ? path.resolve(String(args.repo)) : process.cwd();
  const force = Boolean(args.force);
  const cliSkills = parseCliSkills(args.skills ? String(args.skills) : undefined);
  const settings = resolveSettings(repo, args.source ? String(args.source) : undefined, cliSkills);

  if (command === 'link' || command === 'sync') {
    link(repo, settings, force);
    console.log(
      `Linked shared agent kit to: ${repo} (source: ${settings.sourceFile}, skills: ${settings.skills.join(', ')})`,
    );
    return;
  }

  if (command === 'check') {
    check(repo, settings);
    console.log(
      `Shared agent kit is healthy: ${repo} (source: ${settings.sourceFile}, skills: ${settings.skills.join(', ')})`,
    );
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
