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

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={styles.toast} onClick={() => { toast.onClick?.(); onDismiss(); }}>
      <div className={styles.body}>
        <div className={styles.title}>{toast.title}</div>
        <div className={styles.text}>{toast.body}</div>
      </div>
      <button className={styles.close} onClick={(e) => { e.stopPropagation(); onDismiss(); }} title="Dismiss">
        ✕
      </button>
    </div>
  );
}
