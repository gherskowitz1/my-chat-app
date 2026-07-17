const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, LevelFormat, PageBreak,
} = require('docx');
const fs = require('fs');

// ─── Shared helpers ───────────────────────────────────────────────────────────

const C = {
  accent:  '5865F2',
  dark:    '1E1F22',
  body:    '313338',
  sub:     '4E5058',
  muted:   '80848E',
  white:   'FFFFFF',
  green:   '23A55A',
  red:     'ED4245',
  yellow:  'F0B232',
  lblue:   'EEF0FF',
  lgray:   'F8F9FF',
  lgray2:  'F2F3F5',
};

const cb = (color = 'DDDDDD') => ({
  top:    { style: BorderStyle.SINGLE, size: 1, color },
  bottom: { style: BorderStyle.SINGLE, size: 1, color },
  left:   { style: BorderStyle.SINGLE, size: 1, color },
  right:  { style: BorderStyle.SINGLE, size: 1, color },
});
const nb = () => ({
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
});

const sp = (n = 120) => new Paragraph({ spacing: { after: n }, children: [] });
const pb = () => new Paragraph({ children: [new PageBreak()] });

function h1(text, color = C.dark) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.accent, space: 6 } },
    children: [new TextRun({ text, font: 'Arial', size: 30, bold: true, color })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 100 },
    children: [new TextRun({ text, font: 'Arial', size: 24, bold: true, color: C.accent })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, font: 'Arial', size: 22, bold: true, color: C.dark })],
  });
}
function body(text) {
  return new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text, font: 'Arial', size: 22, color: C.body })],
  });
}
function bullet(runs) {
  const children = typeof runs === 'string'
    ? [new TextRun({ text: runs, font: 'Arial', size: 22, color: C.body })]
    : runs;
  return new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 80 }, children });
}
function step(runs) {
  const children = typeof runs === 'string'
    ? [new TextRun({ text: runs, font: 'Arial', size: 22, color: C.body })]
    : runs;
  return new Paragraph({ numbering: { reference: 'steps', level: 0 }, spacing: { after: 80 }, children });
}
function bold(text) { return new TextRun({ text, font: 'Arial', size: 22, bold: true, color: C.body }); }
function reg(text)  { return new TextRun({ text, font: 'Arial', size: 22, color: C.body }); }

function note(text, type = 'info') {
  const bg    = { info: C.lblue, warning: 'FFF8E1', danger: 'FDECEA', success: 'E8F5E9' };
  const label = { info: 'NOTE', warning: 'TIP', danger: 'IMPORTANT', success: 'REMINDER' };
  const lc    = { info: C.accent, warning: 'F57C00', danger: C.red, success: C.green };
  return new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      borders: nb(), shading: { fill: bg[type], type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 200, right: 200 },
      width: { size: 9360, type: WidthType.DXA },
      children: [new Paragraph({ spacing: { after: 0 }, children: [
        new TextRun({ text: `${label[type]}: `, font: 'Arial', size: 22, bold: true, color: lc[type] }),
        new TextRun({ text, font: 'Arial', size: 22, color: C.body }),
      ]})],
    })]})],
  });
}

function sql(code) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      borders: cb('444444'), shading: { fill: '2B2D31', type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 200, right: 200 },
      width: { size: 9360, type: WidthType.DXA },
      children: [new Paragraph({ spacing: { after: 0 }, children: [
        new TextRun({ text: code, font: 'Courier New', size: 20, color: 'A8D8A8' }),
      ]})],
    })]})],
  });
}

function hrow(cells, widths, accent = C.accent) {
  return new TableRow({ tableHeader: true, children: cells.map((t, i) => new TableCell({
    borders: cb(accent), shading: { fill: accent, type: ShadingType.CLEAR },
    margins: { top: 100, bottom: 100, left: 150, right: 150 },
    width: { size: widths[i], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: [new TextRun({ text: t, font: 'Arial', size: 20, bold: true, color: C.white })] })],
  })) });
}
function drow(cells, widths, shaded = false) {
  return new TableRow({ children: cells.map((t, i) => new TableCell({
    borders: cb(), shading: { fill: shaded ? C.lgray : C.white, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 150, right: 150 },
    width: { size: widths[i], type: WidthType.DXA },
    children: [new Paragraph({ children: [new TextRun({ text: t, font: 'Arial', size: 20, color: C.body })] })],
  })) });
}

function makeHeader(title, subtitle) {
  return new Header({ children: [new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.accent, space: 6 } },
    spacing: { after: 100 },
    children: [
      new TextRun({ text: 'The Crows Nest  ', font: 'Arial', size: 20, bold: true, color: C.accent }),
      new TextRun({ text: `— ${title}`, font: 'Arial', size: 20, color: C.muted }),
    ],
  })] });
}
function makeFooter() {
  return new Footer({ children: [new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'DDDDDD', space: 6 } },
    spacing: { before: 100 }, alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: 'Page ', font: 'Arial', size: 18, color: C.muted }),
      new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 18, color: C.muted }),
      new TextRun({ text: ' of ', font: 'Arial', size: 18, color: C.muted }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Arial', size: 18, color: C.muted }),
    ],
  })] });
}

function coverTitle(text, size = 72) {
  return new Paragraph({ alignment: AlignmentType.CENTER, children: [
    new TextRun({ text, font: 'Arial', size, bold: true, color: C.accent }),
  ]});
}
function coverSub(text, size = 36, color = C.dark) {
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [
    new TextRun({ text, font: 'Arial', size, color }),
  ]});
}

const NUMBERING = {
  config: [
    { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  ],
};
const STYLES = {
  default: { document: { run: { font: 'Arial', size: 22 } } },
  paragraphStyles: [
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 30, bold: true, font: 'Arial', color: C.dark },
      paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 24, bold: true, font: 'Arial', color: C.accent },
      paragraph: { spacing: { before: 260, after: 100 }, outlineLevel: 1 } },
    { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 22, bold: true, font: 'Arial', color: C.dark },
      paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
  ],
};
const PAGE = { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } };
const month = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN GUIDE
// ═══════════════════════════════════════════════════════════════════════════════

const adminDoc = new Document({
  numbering: NUMBERING, styles: STYLES,
  sections: [{
    properties: { page: PAGE },
    headers: { default: makeHeader('Administrator Guide') },
    footers: { default: makeFooter() },
    children: [
      // Cover
      sp(800),
      coverTitle('The Crows Nest'),
      coverSub('Administrator Guide'),
      coverSub('Complete reference for server owners and admins', 22, C.muted),
      coverSub(`Version 2.0  •  ${month}`, 20, 'B5BAC1'),
      sp(1200),

      // 1. Overview
      h1('1. Administrator Overview'),
      body('Administrators have elevated privileges to manage every aspect of The Crows Nest — from renaming channels to moderating voice rooms. This guide covers all admin capabilities.'),
      sp(80),

      h2('1.1 Permission Comparison'),
      sp(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [4200, 2580, 2580],
        rows: [
          hrow(['Action', 'Member', 'Admin'], [4200, 2580, 2580]),
          drow(['Send & receive messages', 'Yes', 'Yes'], [4200, 2580, 2580]),
          drow(['Delete own messages', 'Yes', 'Yes'], [4200, 2580, 2580], true),
          drow(['Delete any message', 'No', 'Yes'], [4200, 2580, 2580]),
          drow(['Create channels', 'No', 'Yes'], [4200, 2580, 2580], true),
          drow(['Delete channels', 'No', 'Yes'], [4200, 2580, 2580]),
          drow(['Rename channels', 'No', 'Yes'], [4200, 2580, 2580], true),
          drow(['Rename server', 'No', 'Yes'], [4200, 2580, 2580]),
          drow(['Grant / revoke admin role', 'No', 'Yes (in-app)'], [4200, 2580, 2580], true),
          drow(['Remove users', 'No', 'Yes (in-app)'], [4200, 2580, 2580]),
          drow(['Mute / unmute in voice', 'No', 'Yes (server-side)'], [4200, 2580, 2580], true),
          drow(['Kick from voice channel', 'No', 'Yes'], [4200, 2580, 2580]),
          drow(['Join voice channels', 'Yes', 'Yes'], [4200, 2580, 2580], true),
          drow(['Send direct messages', 'Yes', 'Yes'], [4200, 2580, 2580]),
          drow(['Adjust per-user volume', 'Yes', 'Yes'], [4200, 2580, 2580], true),
          drow(['Switch audio devices', 'Yes', 'Yes'], [4200, 2580, 2580]),
        ],
      }),
      sp(160),

      h2('1.2 Accessing Admin Settings'),
      body('The Admin Settings panel is only visible to users with the admin role. To open it:'),
      bullet('Log in with your admin account'),
      bullet('Click the gear icon (Settings) in the bottom-left sidebar'),
      bullet('The panel opens with three tabs: Server, Channels, and Users'),
      sp(80),
      note('If the gear icon is not visible, your account may still have the "member" role. See Section 6.1 to grant yourself admin via the Railway database console.', 'warning'),
      sp(160),

      h2('1.3 Full Admin Portal'),
      body('A shield icon above the gear icon opens the full standalone Admin Portal (a separate dashboard at the admin. subdomain) with deeper server management tools. In the desktop app it opens in its own window; in a browser it opens in a new tab.'),
      sp(200),

      pb(),

      // 2. Inviting Users
      h1('2. Inviting Users'),
      body('The Crows Nest uses open registration. Anyone with your server URL can create an account and join immediately — no invite codes required. Any member can also send a direct email invite from within the app.'),
      sp(80),

      h2('2.1 Server URL'),
      body('Share this link with anyone you want to invite:'),
      sp(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
        rows: [new TableRow({ children: [new TableCell({
          borders: cb(C.accent), shading: { fill: C.lblue, type: ShadingType.CLEAR },
          margins: { top: 140, bottom: 140, left: 200, right: 200 },
          width: { size: 9360, type: WidthType.DXA },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: 'https://www.thecrowsnesttalk.com', font: 'Courier New', size: 22, bold: true, color: C.accent }),
          ]})],
        })]})],
      }),
      sp(160),

      h2('2.2 Sending an Email Invite'),
      body('Any member — not just admins — can invite someone by email directly from the app:'),
      sp(40),
      step('Click the Invite button at the top of the channel sidebar'),
      step('Enter the person\'s email address'),
      step('Click Send Invite'),
      sp(80),
      note('The invite email links straight to the signup page with their email pre-filled. Signup stays open to anyone regardless — the invite is a convenience, not a requirement.', 'info'),
      sp(160),

      h2('2.3 How New Users Sign Up'),
      step('Visit the server URL in any browser (or click the link from an invite email)'),
      step('Click Create Account'),
      step('Enter a username (2-32 characters), email, and password (8+ characters)'),
      step('Click Create Account — they are logged in and added to the server instantly'),
      sp(80),
      note('New users are assigned the Member role automatically and can start chatting right away.', 'info'),
      sp(160),

      h2('2.4 Desktop App'),
      body('Point Windows users to the download link on the login page (or share The Crows Nest Setup installer .exe directly). They install it like any Windows application and get a dedicated desktop app with a shortcut in the Start menu. The app checks for updates automatically.'),
      sp(200),

      pb(),

      // 3. Server Settings
      h1('3. Server Settings'),
      h2('3.1 Renaming the Server'),
      step('Click the gear icon in the sidebar to open Admin Settings'),
      step('The Server tab opens by default'),
      step('Edit the SERVER NAME field'),
      step('Optionally add a DESCRIPTION'),
      step('Click Save Changes — the new name appears immediately in the sidebar for all users'),
      sp(160),

      // 4. Channel Management
      h1('4. Channel Management'),
      h2('4.1 Creating a Channel'),
      step('In the main sidebar, click the + button next to TEXT CHANNELS or VOICE CHANNELS'),
      step('Type the channel name in the dialog'),
      step('Click Create'),
      sp(80),
      note('Text channel names are automatically lowercased with spaces replaced by hyphens (e.g. "Game Night" becomes #game-night). Voice channel names keep their original casing.', 'info'),
      sp(160),

      h2('4.2 Renaming a Channel'),
      step('Open Admin Settings (gear icon)'),
      step('Click the Channels tab'),
      step('Hover over a channel and click the pencil (edit) icon'),
      step('Type the new name and press Enter or click Save'),
      sp(80),
      note('Renaming a channel updates it in real time for all connected users without requiring a page refresh.', 'info'),
      sp(160),

      h2('4.3 Deleting a Channel'),
      step('Hover over the channel name in the sidebar'),
      step('Click the trash icon that appears on the right'),
      step('Confirm deletion in the prompt'),
      sp(80),
      note('Deleting a channel permanently removes all messages in it. This cannot be undone.', 'danger'),
      sp(160),

      h2('4.4 Default Channels'),
      body('These channels are created when the server first starts:'),
      sp(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [2800, 1800, 4760],
        rows: [
          hrow(['Channel', 'Type', 'Purpose'], [2800, 1800, 4760]),
          drow(['#general', 'Text', 'Main conversation channel'], [2800, 1800, 4760]),
          drow(['#announcements', 'Text', 'Server-wide announcements'], [2800, 1800, 4760], true),
          drow(['General Voice', 'Voice', 'Default voice / video room'], [2800, 1800, 4760]),
        ],
      }),
      sp(200),

      pb(),

      // 5. Message Moderation
      h1('5. Message Moderation'),
      h2('5.1 Deleting Messages in the App'),
      bullet('Hover over any message in a text channel'),
      bullet('Click the trash icon that appears on the right'),
      bullet('The message is deleted immediately and disappears for all users in real time'),
      sp(160),

      h2('5.2 Bulk Delete via Database'),
      body('Delete all messages from a specific user:'),
      sp(40),
      sql("DELETE FROM messages\nWHERE user_id = (SELECT id FROM users WHERE email = 'user@example.com');"),
      sp(120),
      body('Delete all messages in a specific channel:'),
      sp(40),
      sql("DELETE FROM messages\nWHERE channel_id = (SELECT id FROM channels WHERE name = 'channel-name');"),
      sp(200),

      pb(),

      // 6. User Management
      h1('6. User Management'),
      h2('6.1 Accessing the User List'),
      step('Open Admin Settings (gear icon)'),
      step('Click the Users tab'),
      step('All registered users are listed with their username, email, and current role'),
      sp(160),

      h2('6.2 Grant or Revoke Admin Role'),
      body('In the Users tab, find the user and click the role button next to their name:'),
      bullet([bold('Up Admin '), reg('— promotes a Member to Admin')]),
      bullet([bold('Down Member '), reg('— demotes an Admin back to Member')]),
      sp(80),
      note('You cannot change your own role in the app. Changes take effect the next time that user logs in.', 'warning'),
      sp(120),
      body('Alternatively, run this SQL in Railway (Postgres > Database > Console):'),
      sp(40),
      sql("UPDATE users SET role = 'admin' WHERE email = 'user@example.com';\n-- To revoke:\nUPDATE users SET role = 'member' WHERE email = 'user@example.com';"),
      sp(160),

      h2('6.3 Remove a User'),
      body('In the Users tab, click the trash icon next to a user and confirm. This removes their account. Their past messages remain visible.'),
      sp(80),
      note('You cannot remove your own account from the admin panel.', 'warning'),
      sp(160),

      h2('6.4 View All Users via SQL'),
      sql('SELECT username, email, role, created_at FROM users ORDER BY created_at DESC;'),
      sp(200),

      pb(),

      // 7. Voice Admin Controls
      h1('7. Voice Channel Admin Controls'),
      body('When you join a voice channel as an admin, an In Voice panel appears below the room showing all connected participants.'),
      sp(80),

      h2('7.1 Muting and Unmuting Participants'),
      bullet('Each participant shows a microphone icon (green = active, red = muted)'),
      bullet('Click the mic icon to toggle their server-side mute state'),
      bullet('A server-side mute affects what everyone in the room hears — not just you'),
      bullet('Click again to unmute them'),
      sp(80),
      note('Server-side mute is different from the Volume Mixer (Section 7.3) which only affects what you personally hear.', 'info'),
      sp(160),

      h2('7.2 Removing a Participant from Voice'),
      bullet('Click the remove icon (clock arrow) next to a participant'),
      bullet('Confirm the prompt — they are immediately disconnected from the voice channel'),
      bullet('They can rejoin by clicking Join Voice again'),
      sp(160),

      h2('7.3 Volume Mixer (All Users)'),
      body('The Volume Mixer panel is visible to all users (not just admins) when others are in the voice channel. It controls what you personally hear:'),
      bullet('Drag the slider left to reduce a participant\'s volume, right to increase it (up to 150%)'),
      bullet('Click the speaker icon to locally mute / unmute a participant'),
      bullet('Volume changes only affect your own audio — other users are not affected'),
      sp(200),

      pb(),

      // 8. Quick Reference
      h1('8. Quick Reference'),
      sp(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [3800, 5560],
        rows: [
          hrow(['Task', 'How'], [3800, 5560]),
          drow(['Invite a user', 'Share the server URL'], [3800, 5560]),
          drow(['Rename server', 'Admin Settings > Server tab > Save'], [3800, 5560], true),
          drow(['Create channel', 'Sidebar + button > name > Create'], [3800, 5560]),
          drow(['Rename channel', 'Admin Settings > Channels > pencil icon'], [3800, 5560], true),
          drow(['Delete channel', 'Sidebar > hover > trash icon'], [3800, 5560]),
          drow(['Delete a message', 'Hover message > trash icon'], [3800, 5560], true),
          drow(['Grant admin', 'Admin Settings > Users > Up Admin button'], [3800, 5560]),
          drow(['Revoke admin', 'Admin Settings > Users > Down Member button'], [3800, 5560], true),
          drow(['Remove user', 'Admin Settings > Users > trash icon'], [3800, 5560]),
          drow(['Mute in voice', 'In Voice panel > mic icon'], [3800, 5560], true),
          drow(['Kick from voice', 'In Voice panel > remove icon'], [3800, 5560]),
          drow(['View server logs', 'Railway > backend service > Deployments > View logs'], [3800, 5560], true),
          drow(['Restart backend', 'Railway > backend service > Deployments > Redeploy'], [3800, 5560]),
        ],
      }),
      sp(200),

      pb(),

      // 9. Troubleshooting
      h1('9. Troubleshooting'),
      sp(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [3400, 5960],
        rows: [
          hrow(['Problem', 'Solution'], [3400, 5960]),
          drow(['Gear icon not showing', 'Log out and back in to refresh your role token'], [3400, 5960]),
          drow(['Server name reverts', 'Hard refresh (Ctrl+Shift+R) after saving'], [3400, 5960], true),
          drow(['User cannot log in', 'Check email/password. Reset by deleting and re-signing up.'], [3400, 5960]),
          drow(['Voice not working', 'Verify LIVEKIT_* env vars in Railway backend Variables tab'], [3400, 5960], true),
          drow(['CORS error in console', 'Update CLIENT_URL in backend Variables to match exact frontend URL'], [3400, 5960]),
          drow(['Backend offline', 'Railway > backend > Deployments > Redeploy'], [3400, 5960], true),
          drow(['Messages not appearing', 'Refresh the page; check Railway backend logs for errors'], [3400, 5960]),
        ],
      }),
      sp(200),

      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'DDDDDD', space: 8 } },
        spacing: { before: 160, after: 0 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'The Crows Nest is hosted on Railway.app  •  React • Node.js • Socket.io • PostgreSQL • LiveKit', font: 'Arial', size: 18, color: 'B5BAC1' })],
      }),
    ],
  }],
});

// ═══════════════════════════════════════════════════════════════════════════════
// USER GUIDE
// ═══════════════════════════════════════════════════════════════════════════════

const userDoc = new Document({
  numbering: NUMBERING, styles: STYLES,
  sections: [{
    properties: { page: PAGE },
    headers: { default: makeHeader('User Guide') },
    footers: { default: makeFooter() },
    children: [
      // Cover
      sp(800),
      coverTitle('The Crows Nest'),
      coverSub('User Guide'),
      coverSub('Everything you need to chat, call, and connect', 22, C.muted),
      coverSub(`Version 2.0  •  ${month}`, 20, 'B5BAC1'),
      sp(1200),

      // 1. Getting Started
      h1('1. Getting Started'),
      h2('1.1 Creating Your Account'),
      step('Open your browser and go to The Crows Nest server URL (your admin will share this with you)'),
      step('Click Create Account'),
      step('Fill in your username (2-32 characters), email address, and a password (8+ characters)'),
      step('Click Create Account — you are logged in immediately'),
      sp(80),
      note('You only need to sign up once. Next time, click Log In and use your email and password.', 'info'),
      sp(160),

      h2('1.2 Logging In and Out'),
      bullet([bold('Log in: '), reg('Enter your email and password on the login screen')]),
      bullet([bold('Log out: '), reg('Click the arrow icon at the very bottom of the left sidebar')]),
      sp(80),
      note('Your session stays active for 180 days. You will be logged out automatically after that.', 'info'),
      sp(160),

      h2('1.3 Inviting Friends'),
      body('Anyone can invite someone new — you do not need to be an admin:'),
      sp(40),
      step('Click the Invite button at the top of the channel sidebar'),
      step('Enter your friend\'s email address'),
      step('Click Send Invite'),
      sp(80),
      note('They\'ll get an email with a direct link straight to the signup page, with their email already filled in.', 'info'),
      sp(200),

      pb(),

      // 2. Navigating the App
      h1('2. Navigating the App'),
      body('The Crows Nest has three main areas visible at all times:'),
      sp(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [2400, 6960],
        rows: [
          hrow(['Area', 'What It Is'], [2400, 6960]),
          drow(['Far-left sidebar', 'Switch between the server and direct messages. Your avatar is here too.'], [2400, 6960]),
          drow(['Channel / DM list', 'Lists all text channels, voice channels, or your DM conversations'], [2400, 6960], true),
          drow(['Main area', 'The chat window, voice room, or empty state when nothing is selected'], [2400, 6960]),
          drow(['Member list', 'Online / offline members shown on the right side of text channels'], [2400, 6960], true),
        ],
      }),
      sp(160),

      h2('2.1 Switching Between Server and Direct Messages'),
      bullet('Click the envelope icon at the top of the far-left sidebar to go to Direct Messages'),
      bullet('Click the G server button below it to go back to the main server channels'),
      sp(200),

      pb(),

      // 3. Text Channels
      h1('3. Text Channels'),
      h2('3.1 Sending a Message'),
      step('Click any text channel (starting with #) in the sidebar'),
      step('Click in the message box at the bottom of the screen'),
      step('Type your message and press Enter or click the send button'),
      sp(80),
      note('Messages can be up to 2,000 characters. There is no file attachment feature yet.', 'info'),
      sp(160),

      h2('3.2 Deleting Your Own Messages'),
      bullet('Hover your mouse over the message you want to delete'),
      bullet('A trash icon appears on the right side of the message'),
      bullet('Click it to permanently delete the message'),
      sp(80),
      note('You can only delete your own messages. Admins can delete anyone\'s messages.', 'info'),
      sp(160),

      h2('3.3 Typing Indicators'),
      body('When you start typing, other users in the same channel see a "... is typing" indicator at the bottom of the chat. It disappears automatically after 2 seconds when you stop typing.'),
      sp(160),

      h2('3.4 Message Grouping'),
      body('Consecutive messages from the same person sent within 5 minutes are grouped together — the avatar and username only appear on the first message to keep the chat clean and readable.'),
      sp(200),

      pb(),

      // 4. Direct Messages
      h1('4. Direct Messages'),
      h2('4.1 Starting a New Conversation'),
      step('Click the envelope icon in the far-left sidebar to go to Direct Messages'),
      step('Click the + button at the top of the DM list'),
      step('A list of all users appears — click the person you want to message'),
      step('The conversation opens and is added to your DM list'),
      sp(160),

      h2('4.2 Sending a Direct Message'),
      bullet('Click the conversation in the DM list on the left'),
      bullet('Type in the message box at the bottom and press Enter'),
      bullet('Messages are delivered in real time'),
      sp(160),

      h2('4.3 Typing Indicators in DMs'),
      body('The same typing indicator as text channels works in DMs — when the other person is typing, you will see their name appear at the bottom of the conversation.'),
      sp(200),

      pb(),

      // 5. Voice Channels
      h1('5. Voice & Video Channels'),
      h2('5.1 Joining a Voice Channel'),
      step('Click a voice channel in the sidebar (shown with a microphone icon)'),
      step('A Join Voice button appears'),
      step('Click it — your browser will ask for microphone permission'),
      step('Click Allow'),
      step('You are now connected and can speak with others in the channel'),
      sp(80),
      note('Your browser must have permission to access your microphone. If denied, go to your browser settings and allow microphone access for this site.', 'warning'),
      sp(160),

      h2('5.2 Leaving a Voice Channel'),
      bullet('Click the Leave button (red phone icon) in the LiveKit control bar at the bottom of the room'),
      bullet('You will be disconnected immediately'),
      sp(160),

      h2('5.3 Voice Controls'),
      body('Below the video area is a compact row of icon buttons — hover over any of them to see its name and keyboard shortcut:'),
      sp(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [2400, 1600, 5360],
        rows: [
          hrow(['Control', 'Shortcut', 'What It Does'], [2400, 1600, 5360]),
          drow(['Mute', 'M', 'Toggles your microphone. When muted, others cannot hear you.'], [2400, 1600, 5360]),
          drow(['Deafen', 'D', 'Mutes your microphone and stops you from hearing anyone else at the same time.'], [2400, 1600, 5360], true),
          drow(['Push to Talk', 'Hold Space', 'Hold the key to transmit; release to go back to muted. Handy in noisy rooms.'], [2400, 1600, 5360]),
          drow(['Leave', 'Esc', 'Disconnects you from the voice channel immediately.'], [2400, 1600, 5360], true),
        ],
      }),
      sp(160),

      h2('5.4 Turning on Your Camera'),
      bullet('Click the camera icon in the control bar to turn on your webcam'),
      bullet('Your video will appear in the room for all participants'),
      bullet('Click it again to turn off your camera'),
      sp(160),

      h2('5.5 Sharing Your Screen'),
      body('You can share your screen, a specific window, or a game with everyone in the voice channel:'),
      sp(40),
      step('Click the screen-share icon in the control bar'),
      step('A picker appears listing every screen and open window (including games) you can share'),
      step('Choose one and click Share (double-click also works)'),
      step('Click the icon again, or Stop Sharing, to end it'),
      sp(80),
      note('In the desktop app, sharing includes your computer\'s system audio automatically (Windows only) — so background music or game sound comes through too, not just what\'s on screen.', 'info'),
      sp(200),

      h2('5.6 Volume Mixer'),
      body('When other people are in the voice channel with you, a Volume Mixer panel appears below the room. This lets you control how loud each person sounds to you personally:'),
      sp(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [2600, 6760],
        rows: [
          hrow(['Control', 'What It Does'], [2600, 6760]),
          drow(['Volume slider', 'Drag left to lower, right to raise. Goes up to 150% to boost quiet speakers.'], [2600, 6760]),
          drow(['Speaker icon', 'Click to locally mute that person (only you stop hearing them)'], [2600, 6760], true),
          drow(['Click again', 'Restores volume to 100% and unmutes them for you'], [2600, 6760]),
        ],
      }),
      sp(80),
      note('Volume Mixer changes only affect what you hear. They do not change anything for other participants in the room.', 'info'),
      sp(200),

      pb(),

      // 6. User Settings
      h1('6. User Settings & Audio Devices'),
      body('Click your avatar (your colored circle at the bottom of the far-left sidebar) to open User Settings.'),
      sp(80),

      h2('6.1 Switching Your Microphone'),
      step('Click your avatar to open User Settings'),
      step('Under Input Device (Microphone), click the dropdown'),
      step('Select your preferred microphone from the list'),
      step('Click Test Microphone to verify it is working (records for 3 seconds)'),
      step('Click Save Changes'),
      sp(80),
      note('Your selection is saved in your browser and automatically used the next time you join a voice channel.', 'info'),
      sp(160),

      h2('6.2 Switching Your Speaker or Headphones'),
      step('In User Settings, find Output Device (Speakers / Headphones)'),
      step('Select your preferred output device from the dropdown'),
      step('Click Save Changes'),
      sp(80),
      note('Output device switching requires Chrome or Edge. Firefox does not support this feature.', 'warning'),
      sp(200),

      pb(),

      // 7. Desktop App
      h1('7. Desktop App (Windows)'),
      body('You can install The Crows Nest as a full desktop application on your Windows PC — download it from the login page.'),
      sp(80),

      h2('7.1 Installing the Desktop App'),
      step('Download the installer from the "Download Windows App" link on the login page'),
      step('Double-click the downloaded Setup .exe file'),
      step('Click through the installer (you can change the install location if desired)'),
      step('Once installed, The Crows Nest appears in your Start menu and on your desktop'),
      step('Double-click to open — it loads directly to The Crows Nest'),
      sp(80),
      note('The app checks for updates automatically in the background and installs them the next time you restart it.', 'info'),
      sp(160),

      h2('7.2 Desktop vs Browser'),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [3200, 3080, 3080],
        rows: [
          hrow(['Feature', 'Desktop App', 'Browser'], [3200, 3080, 3080]),
          drow(['All chat features', 'Yes', 'Yes'], [3200, 3080, 3080]),
          drow(['Runs without browser tab', 'Yes', 'No'], [3200, 3080, 3080], true),
          drow(['Lives in taskbar', 'Yes', 'No'], [3200, 3080, 3080]),
          drow(['Minimizes to system tray', 'Yes', 'No'], [3200, 3080, 3080], true),
          drow(['Same account / messages', 'Yes', 'Yes'], [3200, 3080, 3080]),
        ],
      }),
      sp(200),

      pb(),

      // 8. Tips
      h1('8. Tips & Shortcuts'),
      sp(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [3400, 5960],
        rows: [
          hrow(['Tip', 'Detail'], [3400, 5960]),
          drow(['Press Enter to send', 'Hit Enter in the message box to send your message'], [3400, 5960]),
          drow(['Grouped messages', 'Rapid messages from the same person stack together cleanly'], [3400, 5960], true),
          drow(['Member list toggle', 'Click the people icon in the channel header to hide / show the member list'], [3400, 5960]),
          drow(['Online status', 'Green dot = online, grey dot = offline in the member list'], [3400, 5960], true),
          drow(['Boost quiet speakers', 'Use the Volume Mixer slider past 100% to amplify quiet participants'], [3400, 5960]),
          drow(['Test your mic first', 'Use User Settings > Test Microphone before joining important calls'], [3400, 5960], true),
          drow(['DM anyone', 'You can start a DM with any registered user, not just people in your channels'], [3400, 5960]),
          drow(['Stay signed in', 'Your login session lasts 180 days before requiring you to sign in again'], [3400, 5960], true),
        ],
      }),
      sp(200),

      // 9. Troubleshooting
      h1('9. Troubleshooting'),
      sp(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [3400, 5960],
        rows: [
          hrow(['Problem', 'Solution'], [3400, 5960]),
          drow(['Cannot log in', 'Check your email and password. Use Log In, not Create Account.'], [3400, 5960]),
          drow(['Messages not loading', 'Refresh the page (F5 or Ctrl+R)'], [3400, 5960], true),
          drow(['Cannot hear others in voice', 'Check your speaker/headphone selection in User Settings'], [3400, 5960]),
          drow(['Others cannot hear you', 'Check microphone permission in browser settings; test mic in User Settings'], [3400, 5960], true),
          drow(['Typing indicator stuck', 'It clears automatically after 2 seconds of inactivity'], [3400, 5960]),
          drow(['App says "Failed to fetch"', 'The server may be restarting. Wait 30 seconds and refresh.'], [3400, 5960], true),
          drow(['Desktop app won\'t open', 'Right-click > Run as Administrator, or reinstall from the .exe'], [3400, 5960]),
          drow(['Output dropdown missing', 'Output device switching requires Chrome or Edge, not Firefox'], [3400, 5960], true),
        ],
      }),
      sp(200),

      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'DDDDDD', space: 8 } },
        spacing: { before: 160, after: 0 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Need help? Contact your server admin.', font: 'Arial', size: 18, color: 'B5BAC1' })],
      }),
    ],
  }],
});

// ─── Write both files ─────────────────────────────────────────────────────────
Promise.all([
  Packer.toBuffer(adminDoc).then(b => { fs.writeFileSync('CrowsNest-Admin-Guide.docx', b); console.log('Created: CrowsNest-Admin-Guide.docx'); }),
  Packer.toBuffer(userDoc).then(b =>  { fs.writeFileSync('CrowsNest-User-Guide.docx', b);  console.log('Created: CrowsNest-User-Guide.docx'); }),
]);
