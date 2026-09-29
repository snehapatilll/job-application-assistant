import { analyseResumeAgainstJob, type LlmAnalysis } from './llmService.js';

type Importance = LlmAnalysis['requiredSkills'][number]['importance'];

/**
 * Weights behind the fit score. Missing something the posting calls critical
 * should cost three times as much as missing a nice-to-have.
 */
const IMPORTANCE_WEIGHT: Record<Importance, number> = {
  critical: 3,
  important: 2,
  nice_to_have: 1,
};

export interface SkillAssessment {
  skill: string;
  importance: Importance;
  /** Present for matched skills; the resume text supporting the match. */
  evidence?: string;
}

export interface AnalysisResult {
  fitScore: number;
  summary: string;
  matchedSkills: SkillAssessment[];
  missingSkills: SkillAssessment[];
  bulletSuggestions: LlmAnalysis['bulletSuggestions'];
  coverLetter: string;
  /** The arithmetic behind `fitScore`, so the UI can show its working. */
  scoreBreakdown: {
    earnedWeight: number;
    totalWeight: number;
    weights: Record<Importance, number>;
  };
}

/**
 * Derive the fit score from the skill assessment rather than asking the model
 * for a number.
 *
 * An LLM asked to score directly is inconsistent between runs and cannot
 * explain the figure it gave. Computing it from weighted skill coverage means
 * the score always reconciles with the matched/missing lists shown next to it,
 * and identical inputs give an identical number.
 */
export function calculateFitScore(skills: LlmAnalysis['requiredSkills']): {
  fitScore: number;
  earnedWeight: number;
  totalWeight: number;
} {
  let earnedWeight = 0;
  let totalWeight = 0;

  for (const skill of skills) {
    const weight = IMPORTANCE_WEIGHT[skill.importance];
    totalWeight += weight;
    if (skill.matched) earnedWeight += weight;
  }

  // A posting with no identifiable requirements scores 0 rather than dividing
  // by zero. The zod schema requires at least one skill, so this is defensive.
  const fitScore = totalWeight === 0 ? 0 : Math.round((100 * earnedWeight) / totalWeight);

  return { fitScore, earnedWeight, totalWeight };
}

/** Split the model's single skill list into the two lists the UI shows. */
function partitionSkills(skills: LlmAnalysis['requiredSkills']): {
  matchedSkills: SkillAssessment[];
  missingSkills: SkillAssessment[];
} {
  const matchedSkills: SkillAssessment[] = [];
  const missingSkills: SkillAssessment[] = [];

  for (const { skill, importance, matched, evidence } of skills) {
    if (matched) {
      matchedSkills.push({
        skill,
        importance,
        ...(evidence.trim() === '' ? {} : { evidence }),
      });
    } else {
      missingSkills.push({ skill, importance });
    }
  }

  // Most important first, so the top of each list is what actually matters.
  const byImportance = (a: SkillAssessment, b: SkillAssessment): number =>
    IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance];

  return {
    matchedSkills: matchedSkills.sort(byImportance),
    missingSkills: missingSkills.sort(byImportance),
  };
}

/** Run the analysis and assemble the result stored in `analyses.result`. */
export async function buildAnalysis(
  resumeText: string,
  jobDescription: string,
): Promise<AnalysisResult> {
  const llm = await analyseResumeAgainstJob(resumeText, jobDescription);
  const { fitScore, earnedWeight, totalWeight } = calculateFitScore(llm.requiredSkills);
  const { matchedSkills, missingSkills } = partitionSkills(llm.requiredSkills);

  return {
    fitScore,
    summary: llm.summary,
    matchedSkills,
    missingSkills,
    bulletSuggestions: llm.bulletSuggestions,
    coverLetter: llm.coverLetter,
    scoreBreakdown: { earnedWeight, totalWeight, weights: IMPORTANCE_WEIGHT },
  };
}
