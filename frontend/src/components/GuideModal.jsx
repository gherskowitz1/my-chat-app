import React, { useState } from 'react';
import styles from './GuideModal.module.css';

const NOTE_LABEL = { info: 'Note', warning: 'Tip', danger: 'Important' };

function Block({ block }) {
  switch (block.type) {
    case 'sub':
      return <h3 className={styles.sub}><span className={styles.subNum}>{block.num}</span> {block.title}</h3>;
    case 'body':
      return <p className={styles.body}>{block.text}</p>;
    case 'bullets':
      return (
        <ul className={styles.bullets}>
          {block.items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      );
    case 'steps':
      return (
        <ol className={styles.steps}>
          {block.items.map((item, i) => <li key={i}>{item}</li>)}
        </ol>
      );
    case 'note':
      return (
        <div className={`${styles.note} ${styles[block.variant || 'info']}`}>
          <span className={styles.noteLabel}>{NOTE_LABEL[block.variant || 'info']}:</span> {block.text}
        </div>
      );
    case 'sql':
      return <pre className={styles.sql}>{block.text}</pre>;
    case 'table':
      return (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>{block.headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}

export default function GuideModal({ guide, downloadHref, onClose }) {
  const [activeNum, setActiveNum] = useState(guide.sections[0].num);

  const jumpTo = (num) => {
    setActiveNum(num);
    document.getElementById(`guide-section-${num}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2>{guide.title}</h2>
            <p className={styles.subtitle}>{guide.subtitle}</p>
          </div>
          <div className={styles.headerActions}>
            {downloadHref && (
              <a className={styles.downloadLink} href={downloadHref} download title="Download as a Word document">
                Download .docx
              </a>
            )}
            <button className={styles.closeBtn} onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        <div className={styles.body_}>
          <nav className={styles.toc}>
            {guide.sections.map((s) => (
              <button
                key={s.num}
                className={`${styles.tocItem} ${activeNum === s.num ? styles.tocActive : ''}`}
                onClick={() => jumpTo(s.num)}
              >
                <span className={styles.tocNum}>{s.num}</span> {s.title}
              </button>
            ))}
          </nav>

          <div className={styles.content}>
            {guide.sections.map((s) => (
              <section key={s.num} id={`guide-section-${s.num}`} className={styles.section}>
                <h2 className={styles.sectionTitle}><span className={styles.sectionNum}>{s.num}</span> {s.title}</h2>
                {s.blocks.map((b, i) => <Block key={i} block={b} />)}
              </section>
            ))}
            <p className={styles.footer}>Need more help? Ask in your server, or contact your admin.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
