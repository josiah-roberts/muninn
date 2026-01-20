import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.ts";
import { type Entry, type Tag } from "./db.ts";
import { getEntryTags, listEntries, getEntry, getAgentOverview } from "./storage.ts";
import { withRetry } from "./retry.ts";
import { analyzeEntryWithAgent, type AgentAnalysisResult, type AgentTrajectory, type AnalysisWithTrajectory as AgentAnalysisWithTrajectory } from "../agent/analyzer.ts";

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
  entryId: string,
  transcript: string,
  existingTags: Tag[] = []
): Promise<AnalysisWithTrajectory> {
  console.log(`[analyzeTranscript:${entryId}] Starting analysis, transcript length: ${transcript.length}, existingTags: ${existingTags.length}`);

  // Fetch user-provided agent overview/context
  console.log(`[analyzeTranscript:${entryId}] Fetching agent overview...`);
  const agentOverview = getAgentOverview();
  console.log(`[analyzeTranscript:${entryId}] Agent overview: ${agentOverview ? `${agentOverview.length} chars` : "none"}`);

  console.log(`[analyzeTranscript:${entryId}] Calling analyzeEntryWithAgent...`);
  const agentStartTime = Date.now();
  let fullAnalysis: AgentAnalysisResult;
  let trajectory: AgentTrajectory;
  try {
    const result = await analyzeEntryWithAgent(entryId, transcript, existingTags, agentOverview);
    fullAnalysis = result.analysis;
    trajectory = result.trajectory;
    const agentMs = Date.now() - agentStartTime;
    console.log(`[analyzeTranscript:${entryId}] analyzeEntryWithAgent returned in ${agentMs}ms`);
    console.log(`[analyzeTranscript:${entryId}] Agent result: turns=${trajectory.numTurns}, cost=$${trajectory.totalCostUsd.toFixed(4)}, durationMs=${trajectory.durationMs}`);
    console.log(`[analyzeTranscript:${entryId}] Analysis title: "${fullAnalysis.title}"`);
    console.log(`[analyzeTranscript:${entryId}] Related entries from agent: ${fullAnalysis.related_entries?.length || 0}`);
  } catch (agentError) {
    const agentMs = Date.now() - agentStartTime;
    console.error(`[analyzeTranscript:${entryId}] analyzeEntryWithAgent FAILED after ${agentMs}ms`);
    console.error(`[analyzeTranscript:${entryId}] Agent error:`, agentError);
    throw agentError;
  }

  // Store full result for findRelatedEntries to use
  console.log(`[analyzeTranscript:${entryId}] Caching analysis for findRelatedEntries`);
  lastAgentAnalysis = fullAnalysis;
  lastAgentTrajectory = trajectory;

  // Return the standard AnalysisResult (without related_entries) plus trajectory
  const { related_entries, ...analysis } = fullAnalysis;
  console.log(`[analyzeTranscript:${entryId}] Returning analysis (related_entries stripped for separate processing)`);
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
  console.log(`[findRelatedEntries:${entry.id}] Starting, limit=${limit}`);
  console.log(`[findRelatedEntries:${entry.id}] lastAgentAnalysis cached: ${lastAgentAnalysis ? "yes" : "no"}`);

  // Use the cached agent analysis from the last analyzeTranscript call
  if (!lastAgentAnalysis) {
    console.log(`[findRelatedEntries:${entry.id}] No cached analysis, returning empty array`);
    return [];
  }

  const relatedEntries = lastAgentAnalysis.related_entries || [];
  console.log(`[findRelatedEntries:${entry.id}] Found ${relatedEntries.length} related entries in cached analysis`);

  if (relatedEntries.length > 0) {
    console.log(`[findRelatedEntries:${entry.id}] Related entry IDs: ${relatedEntries.map(r => r.id).join(", ")}`);
  }

  // Clear the cache after use
  const result = relatedEntries
    .slice(0, limit)
    .map(r => {
      console.log(`[findRelatedEntries:${entry.id}] Looking up entry: ${r.id}`);
      const foundEntry = getEntry(r.id);
      if (!foundEntry) {
        console.log(`[findRelatedEntries:${entry.id}]   Entry ${r.id} not found in database`);
      } else {
        console.log(`[findRelatedEntries:${entry.id}]   Entry ${r.id} found: "${foundEntry.title || "Untitled"}"`);
      }
      return foundEntry ? { entry: foundEntry, reason: r.reason } : null;
    })
    .filter((r): r is { entry: Entry; reason: string } => r !== null);

  console.log(`[findRelatedEntries:${entry.id}] Clearing lastAgentAnalysis cache`);
  lastAgentAnalysis = null;
  console.log(`[findRelatedEntries:${entry.id}] Returning ${result.length} valid related entries`);
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
