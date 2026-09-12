import React, { useEffect, useRef, useState } from 'react';
import styles from './PollComposer.module.css';

const WIDTH = 320;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

export default function PollComposer({ anchorRect, onClose, onSubmit }) {
  const ref = useRef(null);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  if (!anchorRect) return null;

  const updateOption = (i, value) => {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  };
  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, '']);
  };
  const removeOption = (i) => {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const trimmedOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim()) return setError('Enter a question.');
    if (trimmedOptions.length < MIN_OPTIONS) return setError(`Add at least ${MIN_OPTIONS} options.`);
    setSubmitting(true);
    try {
      await onSubmit({ question: question.trim(), options: trimmedOptions, allowMultiple });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create poll');
      setSubmitting(false);
    }
  };

  // Anchored above the composer bar (a dropup, not a dropdown) since it opens
  // from a button that sits right at the bottom of the screen.
  const bottom = window.innerHeight - anchorRect.top + 6;
  const left = Math.min(Math.max(anchorRect.right - WIDTH, 8), window.innerWidth - WIDTH - 8);

  return (
    <div ref={ref} className={styles.popover} style={{ bottom, left, width: WIDTH }}>
      <form onSubmit={submit}>
        <div className={styles.header}>📊 Create a Poll</div>
        <textarea
          autoFocus
          className={styles.question}
          placeholder="Ask a question…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={300}
          rows={2}
        />
        <div className={styles.options}>
          {options.map((opt, i) => (
            <div key={i} className={styles.optionRow}>
              <input
                className={styles.optionInput}
                placeholder={`Option ${i + 1}`}
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
                maxLength={120}
              />
              {options.length > MIN_OPTIONS && (
                <button type="button" className={styles.removeBtn} onClick={() => removeOption(i)} title="Remove option">✕</button>
              )}
            </div>
          ))}
        </div>
        {options.length < MAX_OPTIONS && (
          <button type="button" className={styles.addBtn} onClick={addOption}>+ Add option</button>
        )}
        <label className={styles.checkboxRow}>
          <input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} />
          Allow multiple choices
        </label>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Poll'}
          </button>
        </div>
      </form>
    </div>
  );
}
