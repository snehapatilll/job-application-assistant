import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFitScore } from '../../src/services/analysisService.js';
import { llmAnalysisSchema } from '../../src/services/llmService.js';

type Skill = Parameters<typeof calculateFitScore>[0][number];

const skill = (
  name: string,
  importance: Skill['importance'],
  matched: boolean,
  evidence = '',
): Skill => ({ skill: name, importance, matched, evidence });

describe('calculateFitScore', () => {
  test('scores 100 when every requirement is matched', () => {
    const { fitScore } = calculateFitScore([
      skill('TypeScript', 'critical', true),
      skill('PostgreSQL', 'critical', true),
    ]);
    assert.equal(fitScore, 100);
  });

  test('scores 0 when nothing is matched', () => {
    const { fitScore } = calculateFitScore([
      skill('TypeScript', 'critical', false),
      skill('PostgreSQL', 'critical', false),
    ]);
    assert.equal(fitScore, 0);
  });

  test('weights by importance rather than counting skills', () => {
    // critical(3) matched, nice_to_have(1) missing -> 3/4
    const { fitScore } = calculateFitScore([
      skill('TypeScript', 'critical', true),
      skill('Kubernetes', 'nice_to_have', false),
    ]);
    assert.equal(fitScore, 75);
  });

  test('missing a critical skill costs far more than missing a nice-to-have', () => {
    // Same one-of-two ratio as above, importance inverted -> 1/4
    const { fitScore } = calculateFitScore([
      skill('TypeScript', 'critical', false),
      skill('Kubernetes', 'nice_to_have', true),
    ]);
    assert.equal(fitScore, 25);
  });

  test('reports the weights behind the score and rounds to an integer', () => {
    // (3 + 2) of (3 + 2 + 1) = 5/6 = 83.33...
    const { fitScore, earnedWeight, totalWeight } = calculateFitScore([
      skill('TypeScript', 'critical', true),
      skill('AWS', 'important', true),
      skill('Kafka', 'nice_to_have', false),
    ]);
    assert.equal(earnedWeight, 5);
    assert.equal(totalWeight, 6);
    assert.equal(fitScore, 83);
  });

  test('returns 0 rather than NaN for an empty skill list', () => {
    const { fitScore } = calculateFitScore([]);
    assert.equal(fitScore, 0);
  });

  test('does not double-credit a skill the model listed twice', () => {
    const { fitScore } = calculateFitScore([
      skill('PostgreSQL', 'critical', true),
      skill('PostgreSQL', 'critical', false),
    ]);
    assert.equal(fitScore, 50);
  });

  test('handles a realistic mixed result', () => {
    // matched 1 + 3 = 4; total 1 + 3 + 2 + 1 + 3 = 10
    const { fitScore, earnedWeight, totalWeight } = calculateFitScore([
      skill('Kafka', 'nice_to_have', true, 'streaming pipeline'),
      skill('PostgreSQL', 'critical', true, 'tuned queries'),
      skill('AWS', 'important', false),
      skill('Kubernetes', 'nice_to_have', false),
      skill('TypeScript', 'critical', false),
    ]);
    assert.equal(earnedWeight, 4);
    assert.equal(totalWeight, 10);
    assert.equal(fitScore, 40);
  });
});

describe('llmAnalysisSchema', () => {
  const valid = {
    summary: 'A solid match on the backend requirements.',
    requiredSkills: [
      { skill: 'TypeScript', importance: 'critical' as const, matched: true, evidence: 'Used daily' },
    ],
    bulletSuggestions: [{ suggested: 'Rewritten bullet', rationale: 'Targets the posting' }],
    coverLetter: 'Dear hiring manager, ...',
  };

  test('accepts a well-formed response', () => {
    assert.equal(llmAnalysisSchema.safeParse(valid).success, true);
  });

  test('rejects an importance value outside the enum', () => {
    const result = llmAnalysisSchema.safeParse({
      ...valid,
      requiredSkills: [{ ...valid.requiredSkills[0], importance: 'vital' }],
    });
    assert.equal(result.success, false);
  });

  test('rejects a non-boolean matched flag', () => {
    const result = llmAnalysisSchema.safeParse({
      ...valid,
      requiredSkills: [{ ...valid.requiredSkills[0], matched: 'yes' }],
    });
    assert.equal(result.success, false);
  });

  test('rejects an empty skill list, which would make the score meaningless', () => {
    const result = llmAnalysisSchema.safeParse({ ...valid, requiredSkills: [] });
    assert.equal(result.success, false);
  });

  test('rejects a response missing the cover letter', () => {
    const { coverLetter: _omitted, ...withoutLetter } = valid;
    assert.equal(llmAnalysisSchema.safeParse(withoutLetter).success, false);
  });
});
