import React from 'react';
import styles from './PollWidget.module.css';

export default function PollWidget({ poll, currentUserId, onVote }) {
  const totalVotes = poll.options.reduce((sum, o) => sum + o.voteCount, 0);

  return (
    <div className={styles.poll}>
      {poll.options.map((o) => {
        const mine = o.voterIds.includes(currentUserId);
        const pct = totalVotes > 0 ? Math.round((o.voteCount / totalVotes) * 100) : 0;
        return (
          <button
            key={o.id}
            type="button"
            className={`${styles.option} ${mine ? styles.optionMine : ''}`}
            onClick={(e) => { e.stopPropagation(); onVote(o.id); }}
          >
            <div className={styles.optionFill} style={{ width: `${pct}%` }} />
            <span className={styles.optionLabel}>{mine ? '✓ ' : ''}{o.label}</span>
            <span className={styles.optionMeta}>{pct}% · {o.voteCount}</span>
          </button>
        );
      })}
      <div className={styles.pollFooter}>
        📊 {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} · {poll.allowMultiple ? 'pick any number' : 'pick one'}
      </div>
    </div>
  );
}
