/** Shapes returned by the API. Kept in one place so pages agree on them. */

export interface User {
  id: number;
  email: string;
  createdAt: string;
}

export interface ResumeSummary {
  id: number;
  originalFilename: string;
  characterCount: number;
  createdAt: string;
}

export interface Resume extends ResumeSummary {
  extractedText: string;
}

export type Importance = 'critical' | 'important' | 'nice_to_have';

export interface SkillAssessment {
  skill: string;
  importance: Importance;
  /** Only present on matched skills — the resume text supporting the match. */
  evidence?: string;
}

export interface BulletSuggestion {
  suggested: string;
  rationale: string;
}

export interface AnalysisResult {
  fitScore: number;
  summary: string;
  matchedSkills: SkillAssessment[];
  missingSkills: SkillAssessment[];
  bulletSuggestions: BulletSuggestion[];
  coverLetter: string;
  scoreBreakdown: {
    earnedWeight: number;
    totalWeight: number;
    weights: Record<Importance, number>;
  };
}

export interface Analysis {
  id: number;
  resumeId: number;
  jobDescriptionId: number;
  fitScore: number;
  result: AnalysisResult;
  createdAt: string;
}

/** A history row — no `result`, which a list does not need. */
export interface AnalysisSummary {
  id: number;
  fitScore: number;
  createdAt: string;
  resumeFilename: string;
  jobTitle: string;
}

export interface AnalysisPage {
  analyses: AnalysisSummary[];
  hasMore: boolean;
}

/** How each importance level is labelled in the UI. */
export const IMPORTANCE_LABEL: Record<Importance, string> = {
  critical: 'Critical',
  important: 'Important',
  nice_to_have: 'Nice to have',
};
