import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.ts";
import { type Entry, type Tag } from "./db.ts";
import { getEntryTags, listEntries, getEntry } from "./storage.ts";
import { withRetry } from "./retry.ts";
import { analyzeEntryWithAgent, type AgentAnalysisResult, type AgentTrajectory } from "../agent/analyzer.ts";

// Timeout for Claude API requests (120 seconds - analysis can be complex)
const CLAUDE_TIMEOUT_MS = 120_000;

const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey,
  timeout: CLAUDE_TIMEOUT_MS,
});

export interface AnalysisResult {
  title: string;
  summary: string;
  themes: string[];
  tags: string[];
  mood?: string;
  people_mentioned: string[];
  places_mentioned: string[];
  time_references: Array<{
    description: string;
    approximate_date?: string;
  }>;
  key_insights: string[];
  potential_links: Array<{
    reason: string;
    keywords: string[];
  }>;
  follow_up_questions: string[];
}

// Extended analysis result that includes related entries from agent
export interface AnalysisResultWithRelated extends AnalysisResult {
  related_entries?: Array<{ id: string; reason: string }>;
}

// Store the last analysis result to pass related entries to findRelatedEntries
let lastAgentAnalysis: AgentAnalysisResult | null = null;
let lastAgentTrajectory: AgentTrajectory | null = null;

export interface AnalysisWithTrajectory {
  analysis: AnalysisResult;
  trajectory: AgentTrajectory;
}

/**
 * Analyze a transcript using the agent-based approach.
 * The agent will search and fetch related entries to build context.
 * Returns both the analysis and the full agent trajectory.
 */
export async function analyzeTranscript(
  transcript: string,
  existingTags: Tag[] = []
): Promise<AnalysisWithTrajectory> {
  const { analysis: fullAnalysis, trajectory } = await analyzeEntryWithAgent(transcript, existingTags);

  // Store full result for findRelatedEntries to use
  lastAgentAnalysis = fullAnalysis;
  lastAgentTrajectory = trajectory;

  // Return the standard AnalysisResult (without related_entries) plus trajectory
  const { related_entries, ...analysis } = fullAnalysis;
  return { analysis, trajectory };
}

/**
 * Get the trajectory from the last analysis.
 * Must be called after analyzeTranscript for the same entry.
 */
export function getLastTrajectory(): AgentTrajectory | null {
  return lastAgentTrajectory;
}

/**
 * Find related entries - extracts from the agent's analysis.
 * Must be called after analyzeTranscript for the same entry.
 */
export async function findRelatedEntries(
  entry: Entry,
  analysis: AnalysisResult,
  limit = 5
): Promise<Array<{ entry: Entry; reason: string }>> {
  // Use the cached agent analysis from the last analyzeTranscript call
  if (!lastAgentAnalysis) {
    return [];
  }

  const relatedEntries = lastAgentAnalysis.related_entries || [];

  // Clear the cache after use
  const result = relatedEntries
    .slice(0, limit)
    .map(r => {
      const foundEntry = getEntry(r.id);
      return foundEntry ? { entry: foundEntry, reason: r.reason } : null;
    })
    .filter((r): r is { entry: Entry; reason: string } => r !== null);

  lastAgentAnalysis = null;
  return result;
}

// Generate follow-up prompts based on recent entries
export async function generateInterviewQuestions(recentEntries: Entry[]): Promise<string[]> {
  if (recentEntries.length === 0) {
    return [
      "What's on your mind today?",
      "Is there anything you've been thinking about that you'd like to explore?",
      "What happened recently that felt significant to you?",
    ];
  }

  const context = recentEntries.slice(0, 5).map(e => {
    let analysis: AnalysisResult | null = null;
    if (e.analysis_json) {
      try {
        analysis = JSON.parse(e.analysis_json);
      } catch (err) {
        console.error(`Failed to parse analysis_json for entry ${e.id}:`, err);
      }
    }
    return {
      title: e.title || analysis?.title || "Untitled",
      summary: analysis?.summary || e.transcript?.slice(0, 300),
      follow_ups: analysis?.follow_up_questions || [],
    };
  });

  return withRetry(
    async () => {
      const response = await anthropic.messages.create({
        model: "claude-opus-4-5-20251101",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `Based on these recent journal entries, suggest 3-5 thoughtful questions to prompt the next journaling session. The questions should help explore unfinished threads, invite deeper reflection, or connect ideas across entries.

Recent entries:
${JSON.stringify(context, null, 2)}

Provide questions as a JSON array of strings. Be specific and personal based on the content.`,
          },
        ],
      });

      const content = response.content[0];
      if (!content || content.type !== "text") {
        return [];
      }

      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];
      return JSON.parse(jsonMatch[0]) as string[];
    },
    {
      maxAttempts: 3,
      onRetry: (error, attempt, delayMs) => {
        console.warn(`Claude generateInterviewQuestions retry attempt ${attempt} after ${delayMs}ms:`, error);
      },
    }
  );
}
