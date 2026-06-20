import React from 'react';
import styles from './PrivacyPage.module.css';

export default function PrivacyPage() {
  const updated = 'June 20, 2026';

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <img src="/crowsnest.png" alt="The Crows Nest" width="48" height="48" style={{ borderRadius: '8px' }} />
          <h1>The Crows Nest</h1>
        </div>

        <h2>Privacy Policy</h2>
        <p className={styles.updated}>Last updated: {updated}</p>

        <section>
          <h3>1. Introduction</h3>
          <p>
            The Crows Nest ("we", "our", or "us") operates a private chat application available at
            www.thecrowsnesttalk.com and through our desktop application. This Privacy Policy explains
            what information we collect, how we use it, and how we protect it.
          </p>
        </section>

        <section>
          <h3>2. Information We Collect</h3>
          <p>When you create an account, we collect:</p>
          <ul>
            <li><strong>Username</strong> — your chosen display name</li>
            <li><strong>Email address</strong> — used for login only</li>
            <li><strong>Password</strong> — stored as a secure hash (we never store your plain-text password)</li>
          </ul>
          <p>When you use the app, we also store:</p>
          <ul>
            <li><strong>Messages</strong> — text messages you send in channels and direct messages</li>
            <li><strong>Timestamps</strong> — when messages and accounts were created</li>
          </ul>
        </section>

        <section>
          <h3>3. Information We Do Not Collect</h3>
          <ul>
            <li>We do not collect voice or video recordings — voice and video calls are peer-to-peer via LiveKit and are not recorded or stored</li>
            <li>We do not collect payment information</li>
            <li>We do not collect location data</li>
            <li>We do not use advertising or tracking cookies</li>
            <li>We do not sell your data to third parties</li>
          </ul>
        </section>

        <section>
          <h3>4. How We Use Your Information</h3>
          <p>We use the information we collect solely to:</p>
          <ul>
            <li>Authenticate you and provide access to the application</li>
            <li>Display your username and messages to other users in the same server</li>
            <li>Allow you to communicate with other members</li>
          </ul>
        </section>

        <section>
          <h3>5. Data Storage</h3>
          <p>
            Your data is stored in a PostgreSQL database hosted on Railway.app, located in the United States.
            We use industry-standard security measures including encrypted connections (TLS) and hashed passwords.
          </p>
        </section>

        <section>
          <h3>6. Voice and Video</h3>
          <p>
            Voice and video features are powered by LiveKit. When you join a voice channel, your audio and
            video streams are transmitted through LiveKit's infrastructure. We do not record or store any
            voice or video content. Please review LiveKit's privacy policy at livekit.io for more information
            about how they handle media streams.
          </p>
        </section>

        <section>
          <h3>7. Data Sharing</h3>
          <p>
            We do not sell, trade, or share your personal information with third parties except as required
            to operate the service (Railway.app for hosting, LiveKit for voice/video). We will not disclose
            your information to any other party without your consent, unless required by law.
          </p>
        </section>

        <section>
          <h3>8. Data Retention</h3>
          <p>
            Your account and messages are retained as long as your account exists. If you wish to have your
            account and data deleted, contact the server administrator. Administrators can permanently delete
            accounts and associated data from the server database.
          </p>
        </section>

        <section>
          <h3>9. Children's Privacy</h3>
          <p>
            The Crows Nest is intended for users 13 years of age and older. We do not knowingly collect
            personal information from children under 13. If you believe a child under 13 has provided us
            with personal information, please contact the administrator.
          </p>
        </section>

        <section>
          <h3>10. Changes to This Policy</h3>
          <p>
            We may update this Privacy Policy from time to time. Changes will be posted on this page with
            an updated date. Continued use of the application after changes constitutes acceptance of the
            updated policy.
          </p>
        </section>

        <section>
          <h3>11. Contact</h3>
          <p>
            If you have any questions about this Privacy Policy, please contact the server administrator
            through the application.
          </p>
        </section>

        <div className={styles.footer}>
          <a href="/">← Back to The Crows Nest</a>
        </div>
      </div>
    </div>
  );
}
