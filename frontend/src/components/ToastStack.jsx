import React, { useEffect } from 'react';
import styles from './ToastStack.module.css';

const AUTO_DISMISS_MS = 6000;

export default function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className={styles.stack}>
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

// toast: { title, body, onClick?, actions?: [{ label, onClick }], sticky? }
// actions render as buttons under the text (e.g. a Game Night check-in's
// "I'm in" / "Can't make it"); sticky toasts stay until dismissed or
// answered instead of disappearing after a few seconds.
function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (toast.sticky) return;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss, toast.sticky]);

  return (
    <div className={styles.toast} onClick={() => { toast.onClick?.(); onDismiss(); }}>
      <div className={styles.body}>
        <div className={styles.title}>{toast.title}</div>
        <div className={styles.text}>{toast.body}</div>
        {toast.actions?.length > 0 && (
          <div className={styles.actions}>
            {toast.actions.map((a) => (
              <button
                key={a.label}
                className={styles.actionBtn}
                onClick={(e) => { e.stopPropagation(); a.onClick(); onDismiss(); }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className={styles.close} onClick={(e) => { e.stopPropagation(); onDismiss(); }} title="Dismiss">
        ✕
      </button>
    </div>
  );
}
