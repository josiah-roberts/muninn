import { useState } from 'preact/hooks';
import type { AgentTrajectory, TrajectoryMessage } from '../../types/index.ts';
import styles from './TrajectoryViewer.module.css';

interface Props {
  trajectoryJson: string;
}

export function TrajectoryViewer({ trajectoryJson }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  let trajectory: AgentTrajectory | null = null;
  try {
    trajectory = JSON.parse(trajectoryJson);
  } catch {
    return null;
  }

  if (!trajectory) return null;

  const renderMessageContent = (msg: TrajectoryMessage) => {
    if (msg.type === 'system') {
      return (
        <div class={styles.systemMessage}>
          <span class={styles.badge}>init</span>
          <span class={styles.detail}>
            {(msg.tools as string[])?.length || 0} tools available
          </span>
        </div>
      );
    }

    if (msg.type === 'result') {
      return (
        <div class={styles.resultMessage}>
          <span class={`${styles.badge} ${msg.subtype === 'success' ? styles.success : styles.error}`}>
            {msg.subtype}
          </span>
        </div>
      );
    }

    if (msg.type === 'assistant') {
      const content = msg.message?.content || [];
      return (
        <div class={styles.assistantMessage}>
          {content.map((item, i) => {
            if (item.type === 'thinking') {
              const thinking = (item as { thinking?: string }).thinking || '';
              // Truncate long thinking
              const display = thinking.length > 500 ? thinking.slice(0, 500) + '...' : thinking;
              return (
                <div key={i} class={styles.thinkingBlock}>
                  <span class={styles.thinkingLabel}>thinking</span>
                  <div class={styles.thinkingContent}>{display}</div>
                </div>
              );
            }
            if (item.type === 'tool_use') {
              // Clean up tool name (remove mcp prefixes if present)
              const rawName = item.name || 'unknown';
              const toolName = rawName.replace(/^mcp__\w+__/, '');
              return (
                <div key={i} class={styles.toolCall}>
                  <span class={styles.toolName}>{toolName}</span>
                  {item.input && Object.keys(item.input).length > 0 && (
                    <code class={styles.toolInput}>
                      {JSON.stringify(item.input, null, 0).slice(0, 100)}
                      {JSON.stringify(item.input).length > 100 ? '...' : ''}
                    </code>
                  )}
                </div>
              );
            }
            if (item.type === 'text') {
              const text = item.text || '';
              // Truncate long text
              const display = text.length > 200 ? text.slice(0, 200) + '...' : text;
              return (
                <div key={i} class={styles.textContent}>
                  {display}
                </div>
              );
            }
            return null;
          })}
        </div>
      );
    }

    if (msg.type === 'user') {
      const content = msg.message?.content || [];
      return (
        <div class={styles.userMessage}>
          {content.map((item, i) => {
            if (item.type === 'tool_result') {
              const resultContent = item.content || '';
              const preview = typeof resultContent === 'string'
                ? (resultContent.length > 100 ? resultContent.slice(0, 100) + '...' : resultContent)
                : '[object]';
              return (
                <div key={i} class={styles.toolResult}>
                  <span class={styles.badge}>result</span>
                  <code class={styles.resultPreview}>{preview}</code>
                </div>
              );
            }
            return null;
          })}
        </div>
      );
    }

    return null;
  };

  // Filter to only show interesting messages
  const interestingMessages = trajectory.messages.filter(
    msg => msg.type !== 'system' || msg.subtype === 'init'
  );

  return (
    <div class={styles.container}>
      <button
        class={styles.toggle}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span class={styles.arrow}>{isOpen ? '▼' : '▶'}</span>
        Analysis Trajectory
        <span class={styles.stats}>
          {trajectory.numTurns} turns · ${trajectory.totalCostUsd.toFixed(4)} · {(trajectory.durationMs / 1000).toFixed(1)}s
        </span>
      </button>

      {isOpen && (
        <div class={styles.content}>
          <div class={styles.timeline}>
            {interestingMessages.map((msg, i) => (
              <div key={i} class={`${styles.message} ${styles[msg.type]}`}>
                <div class={styles.messageType}>{msg.type}</div>
                {renderMessageContent(msg)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
