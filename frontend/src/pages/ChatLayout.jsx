import React, { useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import ServerSidebar from '../components/ServerSidebar';
import ChannelSidebar from '../components/ChannelSidebar';
import ChatArea from '../components/ChatArea';
import DMSidebar from '../components/DMSidebar';
import DMArea from '../components/DMArea';
import MemberList from '../components/MemberList';
import styles from './ChatLayout.module.css';

const DEFAULT_SERVER = '00000000-0000-0000-0000-000000000001';

export default function ChatLayout() {
  const [activeSection, setActiveSection] = useState('server'); // 'server' | 'dm'
  const [activeChannel, setActiveChannel] = useState(null);
  const [activeConversation, setActiveConversation] = useState(null);
  const [showMembers, setShowMembers] = useState(true);

  return (
    <div className={styles.layout}>
      <ServerSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      {activeSection === 'server' ? (
        <ChannelSidebar
          serverId={DEFAULT_SERVER}
          activeChannel={activeChannel}
          onChannelSelect={setActiveChannel}
        />
      ) : (
        <DMSidebar
          activeConversation={activeConversation}
          onConversationSelect={setActiveConversation}
        />
      )}

      <div className={styles.main}>
        {activeSection === 'server' && activeChannel ? (
          <>
            <ChatArea
              channel={activeChannel}
              onToggleMembers={() => setShowMembers((v) => !v)}
              showMembers={showMembers}
            />
            {showMembers && activeChannel.type === 'text' && (
              <MemberList serverId={DEFAULT_SERVER} />
            )}
          </>
        ) : activeSection === 'dm' && activeConversation ? (
          <DMArea conversation={activeConversation} />
        ) : (
          <EmptyState section={activeSection} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ section }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>
        {section === 'server' ? (
          <svg width="72" height="72" viewBox="0 0 24 24" fill="var(--text-muted)">
            <path d="M5.5 3A2.5 2.5 0 0 0 3 5.5v13A2.5 2.5 0 0 0 5.5 21h13a2.5 2.5 0 0 0 2.5-2.5v-13A2.5 2.5 0 0 0 18.5 3h-13zm7 4.5h1v9h-1v-9zm-4 2h1v7H8.5v-7zm8 2h1v5h-1v-5z"/>
          </svg>
        ) : (
          <svg width="72" height="72" viewBox="0 0 24 24" fill="var(--text-muted)">
            <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
          </svg>
        )}
      </div>
      <p>{section === 'server' ? 'Select a channel to start chatting' : 'Select a conversation or start a new one'}</p>
    </div>
  );
}
