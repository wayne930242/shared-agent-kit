#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const kitRoot = path.resolve(__dirname, '..');

const MANAGED_TAG = '<!-- managed-by: shared-agent-kit -->';
const CONFIG_DIR_NAME = '.shared-agent-kit';
const CONFIG_FILE_NAME = 'config.json';
const GITIGNORE_ENTRY = '.shared-agent-kit/';
const DEFAULT_SOURCE_TOOL = 'codex';
const SKILLS_PATHS = ['./.agent-kit/skills/'];
const TOOL_PATHS = {
  codex: 'AGENTS.md',
  claude: 'CLAUDE.md',
  cursor: '.cursor/rules/00-shared-agent.mdc',
  opencode: '.opencode/AGENTS.md',
};
const ALL_TOOLS = Object.keys(TOOL_PATHS);

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

function configFilePath(repoRoot) {
  return path.join(repoRoot, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
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

function normalizeTool(value) {
  return String(value).trim().toLowerCase();
}

function validateTool(tool) {
  if (!ALL_TOOLS.includes(tool)) {
    throw new Error(`Unsupported tool: ${tool}. Use one of: ${ALL_TOOLS.join(', ')}`);
  }
}

function parseTargets(value) {
  if (!value) {
    return undefined;
  }

  const targets = Array.from(
    new Set(
      String(value)
        .split(',')
        .map((item) => normalizeTool(item))
        .filter((item) => item.length > 0),
    ),
  );

  for (const item of targets) {
    validateTool(item);
  }

  return targets;
}

function defaultTargets(source) {
  return ALL_TOOLS.filter((tool) => tool !== source);
}

function ensureTargets(source, targets) {
  if (targets.length === 0) {
    throw new Error('At least one target tool is required.');
  }

  if (!targets.includes(source)) {
    return [source, ...targets];
  }

  return targets;
}

function resolveSettings(repoRoot, cliSource, cliTargets) {
  const cfg = readConfig(repoRoot);
  const source = normalizeTool(cliSource ?? cfg.source ?? DEFAULT_SOURCE_TOOL);
  validateTool(source);

  const configTargets = Array.isArray(cfg.targets)
    ? cfg.targets.map((item) => normalizeTool(item)).filter((item) => item.length > 0)
    : [];

  for (const item of configTargets) {
    validateTool(item);
  }

  const effectiveTargets = cliTargets ?? (configTargets.length > 0 ? configTargets : defaultTargets(source));
  const targets = ensureTargets(source, effectiveTargets);

  return {
    source,
    targets,
    sourcePath: TOOL_PATHS[source],
    skills: SKILLS_PATHS,
  };
}

function renderList(items) {
  return items.map((item) => `- \`${item}\``).join('\n');
}

function renderEntry(tool, sourcePath, skills) {
  const sourceRef = tool === 'opencode' ? `../${sourcePath}` : `./${sourcePath}`;
  return `${MANAGED_TAG}\n# Shared Agent Entry (${tool})\n\nRead first:\n- \`${sourceRef}\`\n\nSkills paths:\n${renderList(skills)}\n`;
}

function renderCursorRule(sourcePath, skills) {
  return `${MANAGED_TAG}\n---\ndescription: Shared agent rules\nglobs:\nalwaysApply: true\n---\n\n# Shared Agent Rules\n\nRead first:\n- \`./${sourcePath}\`\n\nSkills paths:\n${renderList(skills)}\n`;
}

function renderSourceTemplate(sourceTool, skills) {
  return `# ${sourceTool.toUpperCase()} source\n\nDefine your primary agent system rules here.\n\nSkills paths:\n${renderList(skills)}\n`;
}

function writeManagedFile(file, content, force = false) {
  if (pathExists(file)) {
    const existing = fs.readFileSync(file, 'utf8');
    const isManaged = existing.includes(MANAGED_TAG);
    if (!isManaged && !force) {
      throw new Error(`Skip existing unmanaged file: ${file}`);
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
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

function ensureSourceFile(repoRoot, settings, force = false) {
  const sourcePath = path.join(repoRoot, settings.sourcePath);
  if (pathExists(sourcePath)) {
    return;
  }

  writeManagedFile(sourcePath, renderSourceTemplate(settings.source, settings.skills), force);
}

function ensureConfig(repoRoot, settings) {
  writeConfig(repoRoot, {
    source: settings.source,
    targets: settings.targets,
  });
}

function writeToolEntry(repoRoot, tool, settings, force) {
  const filePath = path.join(repoRoot, TOOL_PATHS[tool]);

  if (tool === settings.source) {
    return;
  }

  if (tool === 'cursor') {
    writeManagedFile(filePath, renderCursorRule(settings.sourcePath, settings.skills), force);
    return;
  }

  writeManagedFile(filePath, renderEntry(tool, settings.sourcePath, settings.skills), force);
}

function link(repoRoot, settings, force = false) {
  ensureConfig(repoRoot, settings);
  ensureGitignore(repoRoot);
  createOrRefreshSymlink(repoRoot, force);
  ensureSourceFile(repoRoot, settings, force);

  for (const tool of settings.targets) {
    writeToolEntry(repoRoot, tool, settings, force);
  }
}

function check(repoRoot, settings) {
  const required = [
    path.join(repoRoot, CONFIG_DIR_NAME),
    configFilePath(repoRoot),
    path.join(repoRoot, '.agent-kit'),
    path.join(repoRoot, settings.sourcePath),
    ...settings.targets.filter((tool) => tool !== settings.source).map((tool) => path.join(repoRoot, TOOL_PATHS[tool])),
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
  const cliSource = args.source ? String(args.source) : undefined;
  const cliTargets = parseTargets(args.targets ? String(args.targets) : undefined);
  const settings = resolveSettings(repo, cliSource, cliTargets);

  if (command === 'link' || command === 'sync') {
    link(repo, settings, force);
    console.log(`Linked shared agent kit to: ${repo} (source: ${settings.source}, targets: ${settings.targets.join(', ')})`);
    return;
  }

  if (command === 'check') {
    check(repo, settings);
    console.log(`Shared agent kit is healthy: ${repo} (source: ${settings.source}, targets: ${settings.targets.join(', ')})`);
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
