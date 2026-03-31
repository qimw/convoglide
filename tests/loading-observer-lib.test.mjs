import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractActiveBranchIds,
  summarizePayload,
  trimByVisibleMessages,
  trimByRecentTurns,
  scoreTrimHeuristics,
} from '../scripts/loading-observer-lib.mjs';

function node(id, role, parent, children = [], text = id) {
  return {
    id,
    parent,
    children,
    message: role
      ? {
          id: `message-${id}`,
          author: { role },
          content: { content_type: 'text', parts: [text] },
        }
      : null,
  };
}

test('extractActiveBranchIds rebuilds the active branch', () => {
  const payload = {
    current_node: 'assistant-2',
    mapping: {
      'convoglide-root': node('convoglide-root', null, null, ['user-1']),
      'user-1': node('user-1', 'user', 'convoglide-root', ['system-1']),
      'system-1': node('system-1', 'system', 'user-1', ['assistant-1'], ''),
      'assistant-1': node('assistant-1', 'assistant', 'system-1', ['user-2']),
      'user-2': node('user-2', 'user', 'assistant-1', ['assistant-2']),
      'assistant-2': node('assistant-2', 'assistant', 'user-2', []),
    },
  };
  assert.deepEqual(extractActiveBranchIds(payload), [
    'convoglide-root',
    'user-1',
    'system-1',
    'assistant-1',
    'user-2',
    'assistant-2',
  ]);
});

test('trimByRecentTurns preserves structural nodes inside the recent turn window', () => {
  const payload = {
    current_node: 'assistant-2',
    mapping: {
      'convoglide-root': node('convoglide-root', null, null, ['user-1']),
      'user-1': node('user-1', 'user', 'convoglide-root', ['system-1']),
      'system-1': node('system-1', 'system', 'user-1', ['assistant-1'], ''),
      'assistant-1': node('assistant-1', 'assistant', 'system-1', ['tool-1']),
      'tool-1': node('tool-1', 'tool', 'assistant-1', ['user-2'], ''),
      'user-2': node('user-2', 'user', 'tool-1', ['system-2']),
      'system-2': node('system-2', 'system', 'user-2', ['assistant-2'], ''),
      'assistant-2': node('assistant-2', 'assistant', 'system-2', []),
    },
  };

  const trimmed = trimByRecentTurns(payload, 1);
  assert.deepEqual(Object.keys(trimmed.payload.mapping), [
    'convoglide-root',
    'user-2',
    'system-2',
    'assistant-2',
  ]);
  assert.equal(trimmed.summary.keptTurns, 1);
  assert.equal(trimmed.summary.retainedStructuralNodes, 1);
  assert.equal(trimmed.summary.terminalRole, 'assistant');
});

test('visible-message trim can look small but still score higher risk', () => {
  const payload = {
    current_node: 'assistant-2',
    mapping: {
      'convoglide-root': node('convoglide-root', null, null, ['user-1']),
      'user-1': node('user-1', 'user', 'convoglide-root', ['assistant-1']),
      'assistant-1': node('assistant-1', 'assistant', 'user-1', ['user-2']),
      'user-2': node('user-2', 'user', 'assistant-1', ['system-2']),
      'system-2': node('system-2', 'system', 'user-2', ['assistant-2'], ''),
      'assistant-2': node('assistant-2', 'assistant', 'system-2', []),
    },
  };

  const visible = trimByVisibleMessages(payload, 2);
  const turns = trimByRecentTurns(payload, 2);
  const visibleScore = scoreTrimHeuristics(visible.summary);
  const turnScore = scoreTrimHeuristics(turns.summary);

  assert.equal(visible.summary.keptVisibleMessages, 2);
  assert.equal(turns.summary.keptTurns, 2);
  assert.ok(turnScore.score >= visibleScore.score);
});

test('summarizePayload reports Q+A rounds and averages', () => {
  const payload = {
    current_node: 'assistant-2',
    mapping: {
      'convoglide-root': node('convoglide-root', null, null, ['user-1']),
      'user-1': node('user-1', 'user', 'convoglide-root', ['assistant-1'], 'hello'),
      'assistant-1': node('assistant-1', 'assistant', 'user-1', ['user-2'], 'world world'),
      'user-2': node('user-2', 'user', 'assistant-1', ['assistant-2'], 'x'),
      'assistant-2': node('assistant-2', 'assistant', 'user-2', [], 'answer'),
    },
  };

  const summary = summarizePayload(payload);
  assert.equal(summary.qaRounds, 2);
  assert.equal(summary.roleCounts.user, 2);
  assert.equal(summary.roleCounts.assistant, 2);
  assert.equal(summary.branchMessageNodes, 4);
});
