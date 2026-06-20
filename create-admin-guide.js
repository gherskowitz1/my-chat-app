const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, LevelFormat, ExternalHyperlink,
} = require('docx');
const fs = require('fs');

const ACCENT = '5865F2';
const DARK = '1E1F22';
const LIGHT_BLUE = 'EEF0FF';
const GRAY = 'F2F3F5';
const GREEN = '23A55A';
const RED = 'ED4245';
const WHITE = 'FFFFFF';

const cellBorder = (color = 'DDDDDD') => ({
  top: { style: BorderStyle.SINGLE, size: 1, color },
  bottom: { style: BorderStyle.SINGLE, size: 1, color },
  left: { style: BorderStyle.SINGLE, size: 1, color },
  right: { style: BorderStyle.SINGLE, size: 1, color },
});

const noBorder = () => ({
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
});

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 6 } },
    children: [new TextRun({ text, font: 'Arial', size: 28, bold: true, color: DARK })],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, font: 'Arial', size: 24, bold: true, color: ACCENT })],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, font: 'Arial', size: 22, bold: true, color: DARK })],
  });
}

function body(text) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, font: 'Arial', size: 22, color: '313338' })],
  });
}

function bullet(text, bold = false) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, font: 'Arial', size: 22, bold, color: '313338' })],
  });
}

function note(text, type = 'info') {
  const colors = { info: LIGHT_BLUE, warning: 'FFF8E1', danger: 'FDECEA' };
  const labels = { info: 'NOTE', warning: 'TIP', danger: 'IMPORTANT' };
  const labelColors = { info: ACCENT, warning: 'F57C00', danger: RED };
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({
      children: [new TableCell({
        borders: noBorder(),
        shading: { fill: colors[type], type: ShadingType.CLEAR },
        margins: { top: 120, bottom: 120, left: 200, right: 200 },
        width: { size: 9360, type: WidthType.DXA },
        children: [new Paragraph({
          spacing: { after: 0 },
          children: [
            new TextRun({ text: `${labels[type]}: `, font: 'Arial', size: 22, bold: true, color: labelColors[type] }),
            new TextRun({ text, font: 'Arial', size: 22, color: '313338' }),
          ],
        })],
      })],
    })],
  });
}

function spacer(size = 160) {
  return new Paragraph({ spacing: { after: size }, children: [] });
}

function headerRow(cells, widths) {
  return new TableRow({
    tableHeader: true,
    children: cells.map((text, i) => new TableCell({
      borders: cellBorder(ACCENT),
      shading: { fill: ACCENT, type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 150, right: 150 },
      width: { size: widths[i], type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text, font: 'Arial', size: 20, bold: true, color: WHITE })],
      })],
    })),
  });
}

function dataRow(cells, widths, shaded = false) {
  return new TableRow({
    children: cells.map((text, i) => new TableCell({
      borders: cellBorder(),
      shading: { fill: shaded ? 'F8F9FF' : WHITE, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 150, right: 150 },
      width: { size: widths[i], type: WidthType.DXA },
      children: [new Paragraph({
        children: [new TextRun({ text, font: 'Arial', size: 20, color: '313338' })],
      })],
    })),
  });
}

function sqlBlock(sql) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({
      children: [new TableCell({
        borders: cellBorder('444444'),
        shading: { fill: '2B2D31', type: ShadingType.CLEAR },
        margins: { top: 120, bottom: 120, left: 200, right: 200 },
        width: { size: 9360, type: WidthType.DXA },
        children: [new Paragraph({
          spacing: { after: 0 },
          children: [new TextRun({ text: sql, font: 'Courier New', size: 20, color: 'A8D8A8' })],
        })],
      })],
    })],
  });
}

const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
      {
        reference: 'steps',
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: '%1.',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: DARK },
        paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: ACCENT },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 },
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: 'Arial', color: DARK },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 },
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 6 } },
          spacing: { after: 120 },
          children: [
            new TextRun({ text: 'Chatter ', font: 'Arial', size: 20, bold: true, color: ACCENT }),
            new TextRun({ text: '— Administrator Guide', font: 'Arial', size: 20, color: '80848E' }),
          ],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'DDDDDD', space: 6 } },
          spacing: { before: 120 },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Page ', font: 'Arial', size: 18, color: '80848E' }),
            new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 18, color: '80848E' }),
            new TextRun({ text: ' of ', font: 'Arial', size: 18, color: '80848E' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Arial', size: 18, color: '80848E' }),
          ],
        })],
      }),
    },
    children: [

      // ─── COVER ───────────────────────────────────────────────
      spacer(800),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Chatter', font: 'Arial', size: 72, bold: true, color: ACCENT })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: 'Administrator Guide', font: 'Arial', size: 36, color: DARK })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: 'User Management, Channels & Server Administration', font: 'Arial', size: 22, color: '80848E' })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
        children: [new TextRun({ text: `Version 1.0  •  ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}`, font: 'Arial', size: 20, color: 'B5BAC1' })],
      }),
      spacer(1200),

      // ─── SECTION 1: OVERVIEW ────────────────────────────────
      heading1('1. Administrator Overview'),
      body('As a Chatter administrator you have elevated privileges that allow you to manage channels, moderate messages, and oversee user accounts. This guide covers everything you need to keep your server running smoothly.'),
      spacer(80),

      heading2('1.1 Admin vs Member Permissions'),
      spacer(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3600, 2880, 2880],
        rows: [
          headerRow(['Action', 'Member', 'Admin'], [3600, 2880, 2880]),
          dataRow(['Send messages', '✓ Yes', '✓ Yes'], [3600, 2880, 2880]),
          dataRow(['Delete own messages', '✓ Yes', '✓ Yes'], [3600, 2880, 2880], true),
          dataRow(['Delete any message', '✗ No', '✓ Yes'], [3600, 2880, 2880]),
          dataRow(['Create channels', '✗ No', '✓ Yes'], [3600, 2880, 2880], true),
          dataRow(['Delete channels', '✗ No', '✓ Yes'], [3600, 2880, 2880]),
          dataRow(['Send direct messages', '✓ Yes', '✓ Yes'], [3600, 2880, 2880], true),
          dataRow(['Join voice channels', '✓ Yes', '✓ Yes'], [3600, 2880, 2880]),
          dataRow(['Grant admin role', '✗ No', '✓ Yes (via SQL)'], [3600, 2880, 2880], true),
        ],
      }),
      spacer(160),

      // ─── SECTION 2: INVITING USERS ──────────────────────────
      heading1('2. Inviting Users to the Server'),
      body('Chatter uses open registration — anyone with your server URL can create an account. There is no invite code system by default. Sharing the URL is all that is needed.'),
      spacer(80),

      heading2('2.1 Sharing the Server URL'),
      body('Your Chatter server is accessible at the following URL. Share this with anyone you want to invite:'),
      spacer(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [9360],
        rows: [new TableRow({
          children: [new TableCell({
            borders: cellBorder(ACCENT),
            shading: { fill: LIGHT_BLUE, type: ShadingType.CLEAR },
            margins: { top: 140, bottom: 140, left: 200, right: 200 },
            width: { size: 9360, type: WidthType.DXA },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'https://enthusiastic-peace-production-7a96.up.railway.app', font: 'Courier New', size: 22, bold: true, color: ACCENT })],
            })],
          })],
        })],
      }),
      spacer(160),
      body('Ways to share the link:'),
      bullet('Email it directly to your users'),
      bullet('Share it in a group chat (Discord, WhatsApp, Slack, etc.)'),
      bullet('Post it in a shared document or wiki'),
      bullet('Have users install the desktop app using the Chatter Setup installer'),
      spacer(80),
      note('New users who sign up will automatically join the General server and can start chatting in any text channel immediately. They are assigned the Member role by default.', 'info'),
      spacer(160),

      heading2('2.2 What New Users Need to Do'),
      body('When a new user visits the URL for the first time:'),
      new Paragraph({
        numbering: { reference: 'steps', level: 0 },
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Click “Create Account” on the login screen', font: 'Arial', size: 22 })],
      }),
      new Paragraph({
        numbering: { reference: 'steps', level: 0 },
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Enter a username (2–32 characters), email address, and password (8+ characters)', font: 'Arial', size: 22 })],
      }),
      new Paragraph({
        numbering: { reference: 'steps', level: 0 },
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Click “Create Account” — they are automatically logged in and added to the server', font: 'Arial', size: 22 })],
      }),
      new Paragraph({
        numbering: { reference: 'steps', level: 0 },
        spacing: { after: 80 },
        children: [new TextRun({ text: 'They can immediately start messaging in any channel or send direct messages', font: 'Arial', size: 22 })],
      }),
      spacer(160),

      heading2('2.3 Desktop App Installers'),
      body('If you built a Windows desktop installer, users can install the app on their PC instead of using a browser:'),
      bullet('Send them the file: Chatter Setup 1.0.0.exe'),
      bullet('They double-click it, click through the installer'),
      bullet('Chatter appears in their Start menu and creates a desktop shortcut'),
      bullet('The app opens directly to your server — no URL needed'),
      spacer(80),
      note('The desktop app and browser version share the same account — users can use either interchangeably.', 'info'),
      spacer(200),

      // ─── SECTION 3: MANAGING ROLES ──────────────────────────
      heading1('3. Managing User Roles'),
      body('Roles are managed directly in the PostgreSQL database via Railway’s built-in query tool. There are two roles: member (default) and admin.'),
      spacer(80),

      heading2('3.1 Accessing the Database'),
      body('To run any SQL commands:'),
      new Paragraph({
        numbering: { reference: 'steps', level: 0 },
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Go to railway.app and open your project', font: 'Arial', size: 22 })],
      }),
      new Paragraph({
        numbering: { reference: 'steps', level: 0 },
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Click the PostgreSQL service', font: 'Arial', size: 22 })],
      }),
      new Paragraph({
        numbering: { reference: 'steps', level: 0 },
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Click the Data tab', font: 'Arial', size: 22 })],
      }),
      new Paragraph({
        numbering: { reference: 'steps', level: 0 },
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Type your SQL in the query editor and click Run', font: 'Arial', size: 22 })],
      }),
      spacer(160),

      heading2('3.2 Grant Admin Role'),
      body('To make a user an administrator, run this SQL (replace the email with their actual address):'),
      spacer(60),
      sqlBlock("UPDATE users SET role = 'admin' WHERE email = 'user@example.com';"),
      spacer(100),
      note('The user must log out and back in for the admin role to take effect in the app.', 'warning'),
      spacer(160),

      heading2('3.3 Revoke Admin Role'),
      body('To demote an admin back to a regular member:'),
      spacer(60),
      sqlBlock("UPDATE users SET role = 'member' WHERE email = 'user@example.com';"),
      spacer(160),

      heading2('3.4 View All Users and Roles'),
      body('To see a list of all registered users and their roles:'),
      spacer(60),
      sqlBlock('SELECT username, email, role, created_at FROM users ORDER BY created_at DESC;'),
      spacer(160),

      heading2('3.5 Delete a User Account'),
      body('To permanently remove a user from the server:'),
      spacer(60),
      sqlBlock("DELETE FROM users WHERE email = 'user@example.com';"),
      spacer(100),
      note('Deleting a user removes their account but their past messages remain visible (shown with a blank username). To also delete their messages, see Section 5.', 'danger'),
      spacer(200),

      // ─── SECTION 4: CHANNEL MANAGEMENT ─────────────────────
      heading1('4. Managing Channels'),
      body('Admins can create and delete both text and voice channels directly from within the Chatter app — no database access required.'),
      spacer(80),

      heading2('4.1 Creating a Channel'),
      new Paragraph({
        numbering: { reference: 'steps', level: 0 },
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Log in to Chatter with your admin account', font: 'Arial', size: 22 })],
      }),
      new Paragraph({
        numbering: { reference: 'steps', level: 0 },
        spacing: { after: 80 },
        children: [new TextRun({ text: 'In the left sidebar, click the + button next to TEXT CHANNELS or VOICE CHANNELS', font: 'Arial', size: 22 })],
      }),
      new Paragraph({
        numbering: { reference: 'steps', level: 0 },
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Type a channel name in the dialog that appears', font: 'Arial', size: 22 })],
      }),
      new Paragraph({
        numbering: { reference: 'steps', level: 0 },
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Click Create — the channel appears immediately for all users', font: 'Arial', size: 22 })],
      }),
      spacer(80),
      note('Text channel names are automatically lowercased and spaces are replaced with hyphens (e.g. “Game Night” becomes #game-night).', 'info'),
      spacer(160),

      heading2('4.2 Deleting a Channel'),
      new Paragraph({
        numbering: { reference: 'steps', level: 0 },
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Hover your mouse over the channel name in the sidebar', font: 'Arial', size: 22 })],
      }),
      new Paragraph({
        numbering: { reference: 'steps', level: 0 },
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Click the trash icon that appears on the right', font: 'Arial', size: 22 })],
      }),
      new Paragraph({
        numbering: { reference: 'steps', level: 0 },
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Confirm the deletion in the prompt', font: 'Arial', size: 22 })],
      }),
      spacer(80),
      note('Deleting a channel permanently removes all messages in that channel. This cannot be undone.', 'danger'),
      spacer(160),

      heading2('4.3 Default Channels'),
      body('The following channels are created automatically when the server starts and cannot be deleted via the UI (they are seeded in the database):'),
      spacer(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3000, 2000, 4360],
        rows: [
          headerRow(['Channel', 'Type', 'Purpose'], [3000, 2000, 4360]),
          dataRow(['#general', 'Text', 'Default channel for all users'], [3000, 2000, 4360]),
          dataRow(['#announcements', 'Text', 'Server-wide announcements'], [3000, 2000, 4360], true),
          dataRow(['General Voice', 'Voice', 'Default voice/video room'], [3000, 2000, 4360]),
        ],
      }),
      spacer(200),

      // ─── SECTION 5: MESSAGE MODERATION ──────────────────────
      heading1('5. Message Moderation'),
      spacer(80),

      heading2('5.1 Deleting Messages in the App'),
      body('As an admin you can delete any message from any user:'),
      bullet('Hover over a message — a trash icon appears on the right side'),
      bullet('Click the trash icon to permanently delete the message'),
      bullet('The message disappears immediately for all users in real time'),
      spacer(160),

      heading2('5.2 Bulk Delete Messages via SQL'),
      body('To delete all messages from a specific user across all channels:'),
      spacer(60),
      sqlBlock("DELETE FROM messages WHERE user_id = (\n  SELECT id FROM users WHERE email = 'user@example.com'\n);"),
      spacer(100),
      body('To delete all messages in a specific channel:'),
      spacer(60),
      sqlBlock("DELETE FROM messages WHERE channel_id = (\n  SELECT id FROM channels WHERE name = 'channel-name'\n);"),
      spacer(200),

      // ─── SECTION 6: VOICE/VIDEO ─────────────────────────────
      heading1('6. Voice & Video Management'),
      spacer(80),

      heading2('6.1 How Voice Channels Work'),
      body('Voice channels are powered by LiveKit. Each voice channel creates a separate room that users join independently. There is no persistent connection — users join and leave rooms as needed.'),
      spacer(80),
      body('As an admin there is nothing special to do to manage voice channels — create and delete them the same way as text channels (see Section 4).'),
      spacer(160),

      heading2('6.2 LiveKit Dashboard'),
      body('For advanced voice management (viewing active rooms, participants, recording), log in to your LiveKit project at:'),
      spacer(40),
      new Paragraph({
        spacing: { after: 120 },
        children: [new ExternalHyperlink({
          link: 'https://cloud.livekit.io',
          children: [new TextRun({ text: 'https://cloud.livekit.io', font: 'Arial', size: 22, color: ACCENT, underline: {} })],
        })],
      }),
      body('From there you can see all active rooms, connected participants, and optionally enable recording.'),
      spacer(200),

      // ─── SECTION 7: COMMON TASKS QUICK REFERENCE ───────────
      heading1('7. Quick Reference: Common Admin Tasks'),
      spacer(80),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3800, 5560],
        rows: [
          headerRow(['Task', 'How to Do It'], [3800, 5560]),
          dataRow(['Invite a new user', 'Share the server URL — they sign up themselves'], [3800, 5560]),
          dataRow(['Grant admin role', 'Railway → Postgres → Data tab → run UPDATE SQL'], [3800, 5560], true),
          dataRow(['Revoke admin role', 'Railway → Postgres → Data tab → run UPDATE SQL'], [3800, 5560]),
          dataRow(['Delete a user', 'Railway → Postgres → Data tab → run DELETE SQL'], [3800, 5560], true),
          dataRow(['Create a channel', 'Chatter app → click + next to channel section'], [3800, 5560]),
          dataRow(['Delete a channel', 'Chatter app → hover channel → click trash icon'], [3800, 5560], true),
          dataRow(['Delete a message', 'Chatter app → hover message → click trash icon'], [3800, 5560]),
          dataRow(['View all users', 'Railway → Postgres → Data tab → run SELECT SQL'], [3800, 5560], true),
          dataRow(['Restart the server', 'Railway → backend service → Deployments → Redeploy'], [3800, 5560]),
          dataRow(['View server logs', 'Railway → backend service → Deployments → View logs'], [3800, 5560], true),
        ],
      }),
      spacer(200),

      // ─── SECTION 8: TROUBLESHOOTING ─────────────────────────
      heading1('8. Troubleshooting'),
      spacer(80),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3600, 5760],
        rows: [
          headerRow(['Problem', 'Solution'], [3600, 5760]),
          dataRow(['User can\'t log in', 'Ask them to check their email/password. Reset via DELETE + re-signup if needed.'], [3600, 5760]),
          dataRow(['Admin buttons not showing', 'User must log out and back in after role is granted.'], [3600, 5760], true),
          dataRow(['Messages not appearing', 'Refresh the page. Check Railway backend logs for errors.'], [3600, 5760]),
          dataRow(['Voice not working', 'Check LiveKit env vars in Railway backend service Variables tab.'], [3600, 5760], true),
          dataRow(['App shows "Failed to fetch"', 'Check CLIENT_URL in backend Variables matches the frontend URL exactly.'], [3600, 5760]),
          dataRow(['Backend is offline', 'Railway → backend service → Deployments → Redeploy latest.'], [3600, 5760], true),
        ],
      }),
      spacer(200),

      // ─── FOOTER NOTE ─────────────────────────────────────────
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'DDDDDD', space: 8 } },
        spacing: { before: 160, after: 0 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Chatter is hosted on Railway.app • Powered by React, Node.js, Socket.io, PostgreSQL & LiveKit', font: 'Arial', size: 18, color: 'B5BAC1' })],
      }),
    ],
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync('Chatter-Admin-Guide.docx', buffer);
  console.log('Created: Chatter-Admin-Guide.docx');
});
