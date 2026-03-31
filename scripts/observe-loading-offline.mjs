import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  summarizePayload,
  trimByVisibleMessages,
  trimByRecentTurns,
  scoreTrimHeuristics,
} from './loading-observer-lib.mjs';

function parseArgs(argv) {
  const args = {
    payloadFile: '',
    visibleKeeps: [8],
    turnWindows: [2, 3, 4],
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (!args.payloadFile && !arg.startsWith('--')) {
      args.payloadFile = resolve(process.cwd(), arg);
      continue;
    }
    if (arg === '--visible-keeps') {
      args.visibleKeeps = String(argv[index + 1] || '8').split(',').map(Number).filter(Number.isFinite);
      index += 1;
      continue;
    }
    if (arg === '--turn-windows') {
      args.turnWindows = String(argv[index + 1] || '2,3,4').split(',').map(Number).filter(Number.isFinite);
      index += 1;
      continue;
    }
    if (arg === '--json') {
      args.json = true;
    }
  }

  if (!args.payloadFile) {
    console.error('Usage: node scripts/observe-loading-offline.mjs <payload-file> [--visible-keeps 8] [--turn-windows 2,3,4] [--json]');
    process.exit(1);
  }

  return args;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Offline Loading Observer');
  lines.push('');
  lines.push(`- Payload file: \`${report.payloadFile}\``);
  lines.push(`- Response bytes: \`${report.baseline.responseBytes}\``);
  lines.push(`- Mapping nodes: \`${report.baseline.mappingNodes}\``);
  lines.push(`- Active-branch message nodes: \`${report.baseline.branchMessageNodes}\``);
  lines.push(`- Q+A rounds: \`${report.baseline.qaRounds}\``);
  lines.push('');
  lines.push('## Strategy comparison');
  lines.push('');
  lines.push('| Strategy | Param | Bytes | Nodes | Visible msgs | Turns | Structural nodes | Terminal role | Heuristic risk | Score |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |');
  for (const row of report.rows) {
    lines.push(`| ${row.strategy} | ${row.param} | ${row.bytes} | ${row.nodes} | ${row.visibleMessages} | ${row.turns} | ${row.structuralNodes} | ${row.terminalRole || 'n/a'} | ${row.risk} | ${row.score} |`);
  }
  lines.push('');
  lines.push('## Warnings');
  lines.push('');
  for (const row of report.rows) {
    lines.push(`### ${row.strategy} ${row.param}`);
    if (!row.warnings.length) {
      lines.push('- none');
    } else {
      for (const warning of row.warnings) {
        lines.push(`- ${warning}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const payload = JSON.parse(readFileSync(args.payloadFile, 'utf8'));
const baseline = summarizePayload(payload);

const rows = [];
for (const keep of args.visibleKeeps) {
  const result = trimByVisibleMessages(payload, keep);
  const heuristics = scoreTrimHeuristics(result.summary);
  rows.push({
    strategy: 'visible-message',
    param: keep,
    bytes: result.summary.bytes,
    nodes: result.summary.afterNodes,
    visibleMessages: result.summary.keptVisibleMessages,
    turns: result.summary.keptTurns,
    structuralNodes: result.summary.retainedStructuralNodes,
    terminalRole: result.summary.terminalRole,
    risk: heuristics.risk,
    score: heuristics.score,
    warnings: heuristics.warnings,
  });
}
for (const turns of args.turnWindows) {
  const result = trimByRecentTurns(payload, turns);
  const heuristics = scoreTrimHeuristics(result.summary);
  rows.push({
    strategy: 'turn-window',
    param: turns,
    bytes: result.summary.bytes,
    nodes: result.summary.afterNodes,
    visibleMessages: result.summary.keptVisibleMessages,
    turns: result.summary.keptTurns,
    structuralNodes: result.summary.retainedStructuralNodes,
    terminalRole: result.summary.terminalRole,
    risk: heuristics.risk,
    score: heuristics.score,
    warnings: heuristics.warnings,
  });
}

const report = {
  payloadFile: args.payloadFile,
  baseline,
  rows,
  markdown: renderMarkdown({ payloadFile: args.payloadFile, baseline, rows }),
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(report.markdown);
}
