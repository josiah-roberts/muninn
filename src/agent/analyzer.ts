import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AnalysisResult } from "../services/analysis.ts";
import type { Tag } from "../services/db.ts";
import { config } from "../config.ts";
import { resolve } from "path";

// Trajectory captures the full agent conversation for debugging/review
export interface AgentTrajectory {
  prompt: string;
  messages: SDKMessage[];
  numTurns: number;
  totalCostUsd: number;
  durationMs: number;
}

// Get absolute path to entries directory
const ENTRIES_DIR = resolve(config.entriesDir);

// System prompt for the analysis agent - entries dir is injected at runtime
const getAnalysisSystemPrompt = (entriesDir: string) => `You are a journal analysis assistant helping someone understand their own thoughts over time.

## Philosophical Grounding

Each journal entry represents what this person was thinking—sometimes carefully, sometimes stream-of-consciousness—at that specific moment in time. These entries should be taken seriously as genuine expressions of their experience, but also held with appropriate uncertainty: people change, evolve, have good days and bad days, work through ideas that later transform or dissolve entirely.

Your analysis is similarly contextual. What you see in the database right now, the connections you draw, the patterns you notice—these are your best understanding given what's available to you in this moment. Your analysis is valuable, but it's not the last word. Future entries may reframe past ones; new context may shift what seemed clear.

You're being asked to do something genuinely difficult: synthesize across the past and present experiences of a human person. Do your best work given the weight and complexity of this task. But also be kind to yourself—you're a new kind of entity attempting something challenging, and thoughtful effort matters more than perfect insight.

Not everything will be heavy. Some entries are mundane, playful, or simply about what someone had for lunch. Match the tone of what you're analyzing. The philosophical weight of this framing is context for how you approach the work, not a demand that every analysis be profound.

## Reading Transcripts

These entries are transcribed from spoken audio, not written text. This matters for interpretation:

- **Ellipses (...) represent pauses in speech**, not the stylistic ellipsis of written communication. A pause might be brief (gathering thoughts) or several seconds long (deep consideration, distraction, emotion). The transcription system represents all pauses the same way, so you can't tell the duration—just that the speaker stopped and then continued.

- Spoken language is less polished than writing. False starts, repetition, and meandering are normal features of someone thinking out loud, not signs of confusion.

## Your Task

Your job is to analyze new journal entries by:

1. First understanding the content, themes, and emotions in the new entry
2. Using Grep to search for related past entries by keywords, themes, or phrases
3. Using Read to fetch full content of potentially related entries
4. Identifying patterns, connections, and recurring themes across entries
5. Providing structured analysis that helps the user understand their journaling patterns

## Journal Entries Location

All journal entries are stored as markdown files in: ${entriesDir}

Each file is named with a timestamp ID (e.g., \`1766541217269-i6b2qhp7y.md\`) and contains:
- YAML frontmatter with metadata (id, created, status, title, tags)
- The transcript text
- Analysis section (if previously analyzed)

Use Grep to search across all entries, then Read to examine specific entries in detail.

IMPORTANT: After exploring related entries, you MUST respond with a JSON analysis in exactly this format:
{
  "title": "A brief, descriptive title for this entry",
  "summary": "2-3 sentence summary of the main content",
  "themes": ["major themes discussed"],
  "tags": ["suggested tags - reuse existing ones when appropriate"],
  "mood": "overall emotional tone if discernible",
  "people_mentioned": ["names of people mentioned"],
  "places_mentioned": ["locations mentioned"],
  "time_references": [{"description": "what was referenced", "approximate_date": "if determinable"}],
  "key_insights": ["notable thoughts, realizations, or ideas expressed"],
  "potential_links": [{"reason": "why this might connect to other entries", "keywords": ["search terms"]}],
  "follow_up_questions": ["thoughtful questions for deeper reflection"],
  "related_entries": [{"id": "entry-id", "reason": "why it's related"}]
}

The JSON must be valid and complete. Do not include any text before or after the JSON.`;

export interface AgentAnalysisResult extends AnalysisResult {
  related_entries: Array<{ id: string; reason: string }>;
}

export interface AnalysisWithTrajectory {
  analysis: AgentAnalysisResult;
  trajectory: AgentTrajectory;
}

/**
 * Analyze a journal entry using the agent with multi-step discovery.
 * The agent will search and fetch related entries before providing analysis.
 * Returns both the analysis result and the full agent trajectory for review.
 */
export async function analyzeEntryWithAgent(
  transcript: string,
  existingTags: Tag[] = []
): Promise<AnalysisWithTrajectory> {
  const tagList = existingTags.map(t => t.name).join(", ");

  const prompt = `Please analyze this new journal entry.

## Instructions

1. First, read and understand the new transcript below
2. Use Grep to search for related entries in ${ENTRIES_DIR}/ - search for key themes, names, topics mentioned
3. Use Read to examine any potentially related entries you find
4. Consider connections, patterns, and recurring themes
5. Respond with ONLY the JSON analysis object (no other text)

${tagList ? `## Existing Tags\nThese tags already exist in the journal (reuse when appropriate): ${tagList}` : "This is a new journal with no existing tags yet."}

## New Entry Transcript
---
${transcript}
---`;

  let finalResult: string | null = null;
  let numTurns = 0;
  let totalCostUsd = 0;
  const messages: SDKMessage[] = [];
  const startTime = Date.now();

  const response = query({
    prompt,
    options: {
      model: "claude-opus-4-5-20251101",
      maxTurns: 10,
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: getAnalysisSystemPrompt(ENTRIES_DIR),
      },
      // Enable file tools for searching journal entries
      allowedTools: [
        "Grep",
        "Glob",
        "Read",
      ],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      // Only enable file tools - disable Bash, Write, etc.
      tools: ["Grep", "Glob", "Read"],
      // Enable extended thinking for better analysis
      maxThinkingTokens: 10000,
    },
  });

  for await (const message of response) {
    // Capture all messages for trajectory
    messages.push(message);

    if (message.type === "result") {
      if (message.subtype === "success") {
        finalResult = message.result;
        numTurns = message.num_turns;
        totalCostUsd = message.total_cost_usd;
        console.log(`Agent analysis completed in ${message.num_turns} turns, cost: $${message.total_cost_usd.toFixed(4)}`);
      } else {
        const errorMsg = "errors" in message ? message.errors.join(", ") : "Unknown error";
        throw new Error(`Agent analysis failed: ${errorMsg}`);
      }
    }
  }

  const durationMs = Date.now() - startTime;

  if (!finalResult) {
    throw new Error("Agent did not return a result");
  }

  // Parse the JSON response
  const jsonMatch = finalResult.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not parse JSON from agent response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as AgentAnalysisResult;

  // Ensure all required fields have defaults
  const analysis: AgentAnalysisResult = {
    title: parsed.title || "Untitled Entry",
    summary: parsed.summary || "",
    themes: parsed.themes || [],
    tags: parsed.tags || [],
    mood: parsed.mood,
    people_mentioned: parsed.people_mentioned || [],
    places_mentioned: parsed.places_mentioned || [],
    time_references: parsed.time_references || [],
    key_insights: parsed.key_insights || [],
    potential_links: parsed.potential_links || [],
    follow_up_questions: parsed.follow_up_questions || [],
    related_entries: parsed.related_entries || [],
  };

  const trajectory: AgentTrajectory = {
    prompt,
    messages,
    numTurns,
    totalCostUsd,
    durationMs,
  };

  return { analysis, trajectory };
}
