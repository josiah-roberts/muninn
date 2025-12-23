import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.ts";
import { type Entry, type Tag } from "./db.ts";
import { getEntryTags, listEntries } from "./storage.ts";
import { withRetry } from "./retry.ts";

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

export async function analyzeTranscript(
  transcript: string,
  existingTags: Tag[] = []
): Promise<AnalysisResult> {
  const tagList = existingTags.map(t => t.name).join(", ");

  return withRetry(
    async () => {
      const response = await anthropic.messages.create({
        model: "claude-opus-4-5-20251101",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `You are analyzing a personal journal entry that was transcribed from speech. Extract structured information to help organize and make this content discoverable.

${tagList ? `Existing tags in the journal: ${tagList}` : "This is a new journal, no existing tags yet."}

Transcript:
---
${transcript}
---

Provide your analysis as JSON matching this structure:
{
  "title": "A brief, descriptive title for this entry",
  "summary": "2-3 sentence summary of the main content",
  "themes": ["major themes discussed"],
  "tags": ["suggested tags - reuse existing ones when appropriate, or suggest new ones"],
  "mood": "overall emotional tone if discernible",
  "people_mentioned": ["names of people mentioned"],
  "places_mentioned": ["locations mentioned"],
  "time_references": [{"description": "what was referenced", "approximate_date": "if determinable"}],
  "key_insights": ["notable thoughts, realizations, or ideas expressed"],
  "potential_links": [{"reason": "why this might connect to other entries", "keywords": ["search terms"]}],
  "follow_up_questions": ["thoughtful questions that could prompt deeper reflection or continuation"]
}

Respond with only the JSON, no other text.`,
          },
        ],
      });

      const content = response.content[0];
      if (!content || content.type !== "text") {
        throw new Error("Unexpected response type from Claude");
      }

      // Parse the JSON response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Could not parse JSON from Claude response");
      }

      return JSON.parse(jsonMatch[0]) as AnalysisResult;
    },
    {
      maxAttempts: 3,
      onRetry: (error, attempt, delayMs) => {
        console.warn(`Claude analyzeTranscript retry attempt ${attempt} after ${delayMs}ms:`, error);
      },
    }
  );
}

// Find entries that might be related based on analysis
export async function findRelatedEntries(
  entry: Entry,
  analysis: AnalysisResult,
  limit = 5
): Promise<Array<{ entry: Entry; reason: string }>> {
  // Get recent entries for context
  const recentEntries = listEntries({ limit: 50 })
    .filter(e => e.id !== entry.id && e.transcript);

  if (recentEntries.length === 0) {
    return [];
  }

  // Build a summary of recent entries
  const entrySummaries = recentEntries.map(e => {
    const tags = getEntryTags(e.id);
    let summary = "";
    if (e.analysis_json) {
      try {
        const a = JSON.parse(e.analysis_json) as AnalysisResult;
        summary = a.summary;
      } catch (err) {
        console.error(`Failed to parse analysis_json for entry ${e.id}:`, err);
      }
    }
    return {
      id: e.id,
      title: e.title || "Untitled",
      summary: summary || e.transcript?.slice(0, 200) || "",
      tags: tags.map(t => t.name),
    };
  });

  return withRetry(
    async () => {
      const response = await anthropic.messages.create({
        model: "claude-opus-4-5-20251101",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: `Given this new journal entry:
Title: ${analysis.title}
Summary: ${analysis.summary}
Themes: ${analysis.themes.join(", ")}
Tags: ${analysis.tags.join(", ")}

Find the most related entries from this list:
${JSON.stringify(entrySummaries, null, 2)}

Return JSON array of related entries:
[{"id": "entry-id", "reason": "why it's related"}]

Only include genuinely related entries (0-${limit} entries). Respond with only JSON.`,
          },
        ],
      });

      const content = response.content[0];
      if (!content || content.type !== "text") {
        return [];
      }

      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const related = JSON.parse(jsonMatch[0]) as Array<{ id: string; reason: string }>;
      return related
        .map(r => {
          const foundEntry = recentEntries.find(e => e.id === r.id);
          return foundEntry ? { entry: foundEntry, reason: r.reason } : null;
        })
        .filter((r): r is { entry: Entry; reason: string } => r !== null)
        .slice(0, limit);
    },
    {
      maxAttempts: 3,
      onRetry: (error, attempt, delayMs) => {
        console.warn(`Claude findRelatedEntries retry attempt ${attempt} after ${delayMs}ms:`, error);
      },
    }
  );
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
