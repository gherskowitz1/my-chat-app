const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, LevelFormat, ExternalHyperlink,
} = require('docx');
const fs = require('fs');

const ACCENT = '5865F2';
const DARK = '1E1F22';
const LIGHT_BLUE = 'EEF0FF';
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

function body(text) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, font: 'Arial', size: 22, color: '313338' })],
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, font: 'Arial', size: 22, color: '313338' })],
  });
}

function step(text) {
  return new Paragraph({
    numbering: { reference: 'steps', level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, font: 'Arial', size: 22 })],
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
            new TextRun({ text: 'The Crows Nest ', font: 'Arial', size: 20, bold: true, color: ACCENT }),
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
        children: [new TextRun({ text: 'The Crows Nest', font: 'Arial', size: 64, bold: true, color: ACCENT })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: 'Administrator Guide', font: 'Arial', size: 36, color: DARK })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Complete reference for server owners and admins', font: 'Arial', size: 22, color: '80848E' })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
        children: [new TextRun({ text: `Version 4.0  •  ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}`, font: 'Arial', size: 20, color: 'B5BAC1' })],
      }),
      spacer(1200),

      // ─── SECTION 1: OVERVIEW ────────────────────────────────
      heading1('1. Administrator Overview'),
      body('Administrators have elevated privileges to manage every aspect of The Crows Nest — from renaming channels to moderating voice rooms to controlling who can see a private channel. This guide covers all admin capabilities.'),
      spacer(80),

      heading2('1.1 Permission Comparison'),
      spacer(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [4400, 2480, 2480],
        rows: [
          headerRow(['Action', 'Member', 'Admin'], [4400, 2480, 2480]),
          dataRow(['Send & receive messages', 'Yes', 'Yes'], [4400, 2480, 2480]),
          dataRow(['Delete own messages', 'Yes', 'Yes'], [4400, 2480, 2480], true),
          dataRow(['Delete any message', 'No', 'Yes'], [4400, 2480, 2480]),
          dataRow(['Create channels', 'No', 'Yes'], [4400, 2480, 2480], true),
          dataRow(['Delete / rename channels', 'No', 'Yes'], [4400, 2480, 2480]),
          dataRow(['Rename server', 'No', 'Yes'], [4400, 2480, 2480], true),
          dataRow(['See & join a private channel', 'Only if added', 'Always'], [4400, 2480, 2480]),
          dataRow(['Manage a private channel’s member list', 'No', 'Yes'], [4400, 2480, 2480], true),
          dataRow(['Track a game for update posts (PatchBot)', 'No', 'Yes'], [4400, 2480, 2480]),
          dataRow(['Set PatchBot’s check frequency', 'No', 'Yes'], [4400, 2480, 2480], true),
          dataRow(['Grant / revoke admin role', 'No', 'Yes (in-app)'], [4400, 2480, 2480]),
          dataRow(['Remove users', 'No', 'Yes (in-app)'], [4400, 2480, 2480], true),
          dataRow(['Force a password reset / set a password', 'No', 'Yes (in-app)'], [4400, 2480, 2480]),
          dataRow(['Mute / unmute in voice', 'No', 'Yes (server-side)'], [4400, 2480, 2480], true),
          dataRow(['Kick from voice channel', 'No', 'Yes'], [4400, 2480, 2480]),
          dataRow(['Join voice channels', 'Yes', 'Yes'], [4400, 2480, 2480], true),
          dataRow(['Send direct messages', 'Yes', 'Yes'], [4400, 2480, 2480]),
          dataRow(['Upload / delete custom server emoji', 'No', 'Yes'], [4400, 2480, 2480], true),
          dataRow(['Upload / delete soundboard clips', 'No', 'Yes'], [4400, 2480, 2480]),
          dataRow(['Change server icon / category labels', 'No', 'Yes'], [4400, 2480, 2480], true),
        ],
      }),
      spacer(80),
      note('One admin can additionally hold the Owner flag — see Section 7.7. It doesn’t unlock new actions, but it protects that account from being demoted or removed by other admins.', 'info'),
      spacer(160),

      heading2('1.2 Accessing Admin Settings'),
      body('The Admin Settings panel is only visible to users with the admin role. To open it:'),
      step('Log in with your admin account'),
      step('Click the gear icon (Settings) in the bottom-left sidebar'),
      step('The panel opens with six tabs: Server, Channels, Games, Custom Emoji, Soundboard, and Users'),
      spacer(80),
      note('If the gear icon is not visible, your account may still have the "member" role. See Section 7.2 to grant yourself admin.', 'warning'),
      spacer(160),

      heading2('1.3 Full Admin Portal'),
      body('A shield icon above the gear icon opens the full standalone Admin Portal — a separate dashboard at the admin. subdomain with deeper server management tools. In the desktop app it opens in its own window; in a browser it opens in a new tab. It has eight sections in its sidebar:'),
      spacer(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2400, 6960],
        rows: [
          headerRow(['Tab', 'What It Does'], [2400, 6960]),
          dataRow(['Dashboard', 'Total users, messages, channels, and DMs at a glance, plus a table of recent sign-ups.'], [2400, 6960]),
          dataRow(['Users', 'Search, promote/demote, force a password reset, set a password directly, transfer the Owner flag, or remove a user.'], [2400, 6960], true),
          dataRow(['Channels', 'Create, rename, delete channels, and manage private-channel access.'], [2400, 6960]),
          dataRow(['Games (PatchBot)', 'Pick a channel and manage which games post update notes there; set the check frequency.'], [2400, 6960], true),
          dataRow(['Custom Emoji', 'Upload or delete the server’s custom :name: emoji.'], [2400, 6960]),
          dataRow(['Soundboard', 'Upload or delete the clips available in every voice channel’s Soundboard panel.'], [2400, 6960], true),
          dataRow(['Recent Messages', 'Search the last 100 messages sent across every channel.'], [2400, 6960]),
          dataRow(['Server Settings', 'Rename the server, edit its description, change its icon, and rename the channel category labels.'], [2400, 6960], true),
        ],
      }),
      spacer(200),

      // ─── SECTION 2: INVITING USERS ──────────────────────────
      heading1('2. Inviting Users'),
      body('The Crows Nest uses open registration. Anyone with your server URL can create an account and join immediately — no invite codes required. Any member can also send a direct email invite from within the app.'),
      spacer(80),

      heading2('2.1 Server URL'),
      body('Share this link with anyone you want to invite:'),
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
              children: [new TextRun({ text: 'https://www.thecrowsnesttalk.com', font: 'Courier New', size: 22, bold: true, color: ACCENT })],
            })],
          })],
        })],
      }),
      spacer(160),

      heading2('2.2 Sending an Email Invite'),
      body('Any member — not just admins — can invite someone by email directly from the app:'),
      step('Click the Invite button at the top of the channel sidebar'),
      step('Enter the person’s email address'),
      step('Click Send Invite'),
      spacer(80),
      note('The invite email links straight to the signup page with their email pre-filled. Signup stays open to anyone regardless — the invite is a convenience, not a requirement.', 'info'),
      spacer(160),

      heading2('2.3 How New Users Sign Up'),
      step('Visit the server URL in any browser (or click the link from an invite email)'),
      step('Click Create Account'),
      step('Enter a username (2–32 characters), email, and password (8+ characters)'),
      step('Click Create Account — they are logged in and added to the server instantly'),
      spacer(80),
      note('New users are assigned the Member role automatically and can start chatting right away. Remember Me on the login screen keeps them signed in on that device.', 'info'),
      spacer(160),

      heading2('2.4 Desktop App'),
      body('Point users to the download links on the login page — both Windows and Linux installers are available (share The Crows Nest Setup .exe or .AppImage directly if you prefer). They install it like any normal application and get a dedicated desktop app with a shortcut/launcher entry. The app checks for updates automatically.'),
      spacer(200),

      // ─── SECTION 3: SERVER SETTINGS ─────────────────────────
      heading1('3. Server Settings'),
      heading2('3.1 Renaming the Server'),
      step('Click the gear icon in the sidebar to open Admin Settings (or use Server Settings in the full Admin Portal)'),
      step('Edit the SERVER NAME field'),
      step('Optionally add a DESCRIPTION'),
      step('Click Save Changes — the new name appears immediately in the sidebar for all users'),
      spacer(160),

      heading2('3.2 Server Icon'),
      body('In the same Server Settings tab, click Change Icon under SERVER ICON to upload an image, or Remove to go back to the default lettered icon. It appears in the sidebar for everyone.'),
      spacer(160),

      heading2('3.3 Renaming the Channel Category Labels'),
      body('The TEXT CHANNELS SECTION LABEL and VOICE CHANNELS SECTION LABEL fields (same Server Settings tab) let you rename those two category headings in the sidebar to whatever you like — leave blank to use the defaults.'),
      spacer(200),

      // ─── SECTION 4: CHANNEL MANAGEMENT ─────────────────────
      heading1('4. Channel Management'),
      heading2('4.1 Creating a Channel'),
      step('In the main sidebar, click the + button next to TEXT CHANNELS or VOICE CHANNELS (or use + New Channel in the Admin Portal)'),
      step('Type the channel name'),
      step('Optionally check Private channel and pick which members can see and use it (see Section 5)'),
      step('Click Create'),
      spacer(80),
      note('Text channel names are automatically lowercased with spaces replaced by hyphens (e.g. "Game Night" becomes #game-night). Voice channel names keep their original casing.', 'info'),
      spacer(160),

      heading2('4.2 Renaming a Channel'),
      step('Open Admin Settings (gear icon) or the Admin Portal’s Channels tab'),
      step('Hover over a channel and click the pencil (edit) icon'),
      step('Type the new name and press Enter or click Save'),
      spacer(160),

      heading2('4.3 Deleting a Channel'),
      step('Hover over the channel name in the sidebar (or find it in the Admin Portal’s Channels tab)'),
      step('Click the trash icon'),
      step('Confirm deletion in the prompt'),
      spacer(80),
      note('Deleting a channel permanently removes all messages in it. This cannot be undone.', 'danger'),
      spacer(160),

      heading2('4.4 Default Channels'),
      body('These channels are created when the server first starts:'),
      spacer(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3000, 2000, 4360],
        rows: [
          headerRow(['Channel', 'Type', 'Purpose'], [3000, 2000, 4360]),
          dataRow(['#general', 'Text', 'Main conversation channel'], [3000, 2000, 4360]),
          dataRow(['#announcements', 'Text', 'Server-wide announcements'], [3000, 2000, 4360], true),
          dataRow(['General Voice', 'Voice', 'Default voice / video room'], [3000, 2000, 4360]),
        ],
      }),
      spacer(200),

      // ─── SECTION 5: PRIVATE CHANNELS ────────────────────────
      heading1('5. Private (Hidden) Channels'),
      body('Any text or voice channel can be made private — hidden from everyone except the members you explicitly pick. Non-members can’t see it in their sidebar, can’t read its message history, and can’t get a voice token to join it, even by guessing its link. This is enforced on the server, not just hidden in the interface.'),
      spacer(80),
      note('Admins can always see and join every channel, private or not — the member list only restricts regular members. This keeps management and moderation possible without needing to be added to every private channel individually.', 'info'),
      spacer(160),

      heading2('5.1 Making a Channel Private at Creation'),
      body('Check Private channel in the create-channel dialog and pick members from the checklist that appears (see Section 4.1).'),
      spacer(160),

      heading2('5.2 Changing an Existing Channel’s Access'),
      step('Open Admin Settings (gear icon) or the Admin Portal, and go to the Channels tab'),
      step('Click the lock icon next to the channel'),
      step('Toggle Private on or off'),
      step('If private, check the members who should have access'),
      step('Click Save Access — takes effect immediately for everyone connected'),
      spacer(80),
      note('Changes made from the standalone Admin Portal don’t push a live update to already-connected users the way the in-app panel does — they may need to refresh to see the channel appear or disappear from their sidebar. Access itself (who can actually open or join it) is enforced correctly either way.', 'warning'),
      spacer(200),

      // ─── SECTION 6: MESSAGE MODERATION ──────────────────────
      heading1('6. Message Moderation'),
      heading2('6.1 Deleting Messages in the App'),
      bullet('Hover over any message in a text channel — a trash icon appears on the right'),
      bullet('Click it to permanently delete the message'),
      bullet('The message disappears immediately for all users in real time'),
      spacer(160),

      heading2('6.2 Bulk Delete via Database'),
      body('Delete all messages from a specific user:'),
      spacer(60),
      sqlBlock("DELETE FROM messages\nWHERE user_id = (SELECT id FROM users WHERE email = 'user@example.com');"),
      spacer(100),
      body('Delete all messages in a specific channel:'),
      spacer(60),
      sqlBlock("DELETE FROM messages\nWHERE channel_id = (SELECT id FROM channels WHERE name = 'channel-name');"),
      spacer(200),

      // ─── SECTION 7: USER MANAGEMENT ─────────────────────────
      heading1('7. User Management'),
      heading2('7.1 Accessing the User List'),
      body('Open Admin Settings (gear icon) or the Admin Portal’s Users tab — every registered user is listed with their username, email, and current role.'),
      spacer(160),

      heading2('7.2 Grant or Revoke Admin Role'),
      body('Find the user and click the role button next to their name (Up Admin promotes, Down Member demotes).'),
      spacer(80),
      note('You cannot change your own role in the app. Changes take effect the next time that user logs in.', 'warning'),
      spacer(100),
      body('Alternatively, run this SQL in Railway (Postgres > Database > Console):'),
      spacer(60),
      sqlBlock("UPDATE users SET role = 'admin' WHERE email = 'user@example.com';\n-- To revoke:\nUPDATE users SET role = 'member' WHERE email = 'user@example.com';"),
      spacer(160),

      heading2('7.3 Remove a User'),
      body('Click the trash icon next to a user and confirm. This removes their account; their past messages remain visible.'),
      spacer(80),
      note('You cannot remove your own account from the admin panel.', 'warning'),
      spacer(160),

      heading2('7.4 Force a Password Reset'),
      body('From the Admin Portal’s Users tab, click the envelope icon next to a user to email them a password-reset link — useful if they’ve forgotten their password and can’t reach the login page’s own reset flow.'),
      spacer(160),

      heading2('7.5 Set a User’s Password Directly'),
      body('Click the key icon next to a user in the Admin Portal’s Users tab to set a new password for them on the spot (8+ characters) — useful for getting someone back in immediately without waiting on an email.'),
      spacer(160),

      heading2('7.6 View All Users via SQL'),
      sqlBlock('SELECT username, email, role, created_at FROM users ORDER BY created_at DESC;'),
      spacer(160),

      heading2('7.7 The Owner Role'),
      body('One admin can additionally be marked Owner — a protection layer on top of the admin role, not a separate permission set. An Owner can’t be demoted or removed by another admin, and only the Owner (or, if nobody holds it yet, any admin) can hand the flag to someone else.'),
      step('Open the Users tab (Admin Settings or the Admin Portal)'),
      step('Find the user and click Make Owner (or Transfer Owner, if the flag is already held)'),
      spacer(80),
      note('There’s no way to remove the Owner flag from within the app once set, other than transferring it to someone else — this is intentional, so ownership can’t be stripped by a compromised admin account.', 'warning'),
      spacer(200),

      // ─── SECTION 8: VOICE ADMIN CONTROLS ────────────────────
      heading1('8. Voice Channel Admin Controls'),
      body('When you join a voice channel as an admin, an In Voice panel appears below the room showing all connected participants.'),
      spacer(80),

      heading2('8.1 Muting and Unmuting Participants'),
      bullet('Each participant shows a microphone icon (green = active, red = muted)'),
      bullet('Click the mic icon to toggle their server-side mute state — this affects what everyone in the room hears, not just you'),
      bullet('Click again to unmute them'),
      spacer(160),

      heading2('8.2 Removing a Participant from Voice'),
      bullet('Click the remove icon next to a participant and confirm — they are immediately disconnected'),
      bullet('They can rejoin by clicking Join Voice again'),
      spacer(160),

      heading2('8.3 Volume Mixer (All Users)'),
      body('Visible to everyone, not just admins, when others are in the voice channel. It only changes what you personally hear — it has no effect on other participants.'),
      spacer(200),

      // ─── SECTION 9: PATCHBOT ─────────────────────────────────
      heading1('9. PatchBot — Game Update Tracking'),
      body('PatchBot watches Steam’s public news feed for games you choose to track and automatically posts new update / patch notes into a channel, as messages from a PatchBot account. It’s the same idea as the Discord PatchBot integration, built natively so it works here too.'),
      spacer(80),

      heading2('9.1 Tracking a Game from a Channel'),
      step('Open any text channel and click the controller icon in its header'),
      step('Search for the game by name (matched against Steam’s store search)'),
      step('Click Add — it now posts new patch notes into that channel'),
      spacer(80),
      note('The first time a game is tracked, PatchBot just records its current latest post as a baseline rather than dumping its whole history into the channel — you’ll see new posts starting with the next real update.', 'info'),
      spacer(160),

      heading2('9.2 Managing Games Centrally from the Admin Portal'),
      body('Both Admin Settings and the standalone Admin Portal have a Games tab: pick any text channel from the dropdown, then search/add or remove tracked games for it — without needing to open that channel yourself.'),
      spacer(160),

      heading2('9.3 Setting the Check Frequency'),
      body('In the Games tab, the Check Frequency dropdown ranges from every 1 minute to every 24 hours. Saving takes effect on PatchBot’s next scheduled check — no server restart required.'),
      spacer(80),
      note('Steam’s public API doesn’t cleanly separate "patch notes" from general announcements for every game, so PatchBot posts all news items for a tracked game, not a filtered-to-just-patches subset.', 'warning'),
      spacer(200),

      // ─── SECTION 10: DASHBOARD & MESSAGES ───────────────────
      heading1('10. Dashboard & Recent Messages'),
      heading2('10.1 Dashboard Overview'),
      body('The Admin Portal’s Dashboard tab shows total users, messages, channels, and direct-message conversations at a glance, plus a table of the most recent sign-ups.'),
      spacer(160),

      heading2('10.2 Searching Recent Messages'),
      body('The Recent Messages tab lists the last 100 messages sent across every channel, with a search box to filter by message content or username — useful for moderation without digging through each channel individually.'),
      spacer(200),

      // ─── SECTION 11: CUSTOM EMOJI ────────────────────────────
      heading1('11. Custom Emoji'),
      body('The Custom Emoji tab (Admin Settings or the Admin Portal) lets you upload server-specific emoji that anyone can use by typing :name: in a message or picking them as a reaction.'),
      step('Open the Custom Emoji tab'),
      step('Click Upload, choose an image, and give it a name (letters, numbers, and underscores)'),
      step('Click a delete icon next to any existing emoji to remove it — it disappears from new messages immediately, but stays visible in messages already sent'),
      spacer(80),
      note('Limits: 200 emoji per server, up to about 512KB each.', 'info'),
      spacer(200),

      // ─── SECTION 12: SOUNDBOARD ───────────────────────────────
      heading1('12. Soundboard'),
      body('The Soundboard tab lets you upload audio clips that appear in the Soundboard panel inside every voice channel, for anyone to play during a call.'),
      step('Open the Soundboard tab'),
      step('Click Upload, choose an audio file, and give it a name'),
      step('Click a delete icon next to any existing clip to remove it from the soundboard'),
      spacer(80),
      note('Limits: 500 clips per server, up to about 5MB each. Each user’s own playback volume for a clip is personal to them and doesn’t affect what it sounds like for anyone else.', 'info'),
      spacer(200),

      // ─── SECTION 13: DESKTOP APP RELEASES ─────────────────────
      heading1('13. Releasing a Desktop App Update'),
      body('The desktop app (Windows/macOS/Linux) checks GitHub Releases for new versions and updates itself automatically — this is separate from the web deploy on Railway, which updates the moment you push to the repo.'),
      spacer(80),
      step('In desktop/package.json, bump the "version" field (e.g. 2.0.0 → 2.1.0)'),
      step('Create a GitHub personal access token with repo scope, at github.com/settings/tokens/new, if you don’t already have one handy'),
      step('From the desktop/ folder, run the matching release script with that token set for the command — e.g. on Windows: GH_TOKEN=your_token npm run release:win'),
      step('electron-builder builds the installer and publishes it as a new GitHub Release automatically — existing installs pick it up on their next launch'),
      spacer(80),
      note('Revoke the token from GitHub once you’re done publishing — it doesn’t need to stay active between releases.', 'info'),
      spacer(80),
      note('A Linux (.AppImage) build can only be produced on a Linux machine, or on Windows/Mac with WSL or Docker installed — electron-builder shells out to a Linux tool (mksquashfs) that plain Windows can’t execute. A macOS build additionally needs Apple notarization, which isn’t set up for this project — Mac users should use the browser or the installable web app in the meantime.', 'warning'),
      spacer(200),

      // ─── SECTION 14: QUICK REFERENCE ─────────────────────────
      heading1('14. Quick Reference'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3800, 5560],
        rows: [
          headerRow(['Task', 'How'], [3800, 5560]),
          dataRow(['Invite a user', 'Share the server URL, or click Invite in the sidebar'], [3800, 5560]),
          dataRow(['Rename server', 'Admin Settings > Server tab > Save'], [3800, 5560], true),
          dataRow(['Create a channel', 'Sidebar + button > name > (optional) Private > Create'], [3800, 5560]),
          dataRow(['Rename a channel', 'Admin Settings > Channels > pencil icon'], [3800, 5560], true),
          dataRow(['Delete a channel', 'Sidebar > hover > trash icon'], [3800, 5560]),
          dataRow(['Make a channel private / manage access', 'Admin Settings or Admin Portal > Channels > lock icon'], [3800, 5560], true),
          dataRow(['Track a game (PatchBot)', 'Channel header > controller icon > search > Add'], [3800, 5560]),
          dataRow(['Set PatchBot check frequency', 'Admin Settings or Admin Portal > Games tab'], [3800, 5560], true),
          dataRow(['Delete a message', 'Hover message > trash icon'], [3800, 5560]),
          dataRow(['Grant / revoke admin', 'Admin Settings > Users > Up Admin / Down Member'], [3800, 5560], true),
          dataRow(['Force a password reset', 'Admin Portal > Users > envelope icon'], [3800, 5560]),
          dataRow(['Set a user’s password', 'Admin Portal > Users > key icon'], [3800, 5560], true),
          dataRow(['Remove a user', 'Admin Settings > Users > trash icon'], [3800, 5560]),
          dataRow(['Mute / kick in voice', 'In Voice panel > mic / remove icon'], [3800, 5560], true),
          dataRow(['Search all recent messages', 'Admin Portal > Recent Messages'], [3800, 5560]),
          dataRow(['Upload / delete custom emoji', 'Admin Settings or Admin Portal > Custom Emoji'], [3800, 5560], true),
          dataRow(['Upload / delete a soundboard clip', 'Admin Settings or Admin Portal > Soundboard'], [3800, 5560]),
          dataRow(['Change server icon / category labels', 'Admin Settings or Admin Portal > Server tab'], [3800, 5560], true),
          dataRow(['Make/transfer server Owner', 'Admin Settings or Admin Portal > Users > Make/Transfer Owner'], [3800, 5560]),
          dataRow(['Release a desktop app update', 'Bump desktop/package.json version, run npm run release:win with GH_TOKEN set'], [3800, 5560], true),
          dataRow(['View server logs', 'Railway > backend service > Deployments > View logs'], [3800, 5560]),
          dataRow(['Restart backend', 'Railway > backend service > Deployments > Redeploy'], [3800, 5560], true),
        ],
      }),
      spacer(200),

      // ─── SECTION 15: TROUBLESHOOTING ─────────────────────────
      heading1('15. Troubleshooting'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3600, 5760],
        rows: [
          headerRow(['Problem', 'Solution'], [3600, 5760]),
          dataRow(['Gear icon not showing', 'Log out and back in to refresh your role token'], [3600, 5760]),
          dataRow(['Server name reverts', 'Hard refresh (Ctrl+Shift+R) after saving'], [3600, 5760], true),
          dataRow(['User can’t log in', 'Check email/password. Reset via the Admin Portal or delete + re-signup.'], [3600, 5760]),
          dataRow(['Private channel not hiding for someone', 'Confirm they aren’t an admin — admins always see every channel by design'], [3600, 5760], true),
          dataRow(['PatchBot not posting', 'Confirm the game has had news recently; first-time tracking only sets a baseline, no post yet'], [3600, 5760]),
          dataRow(['Voice not working', 'Verify LIVEKIT_* env vars in Railway backend Variables tab'], [3600, 5760], true),
          dataRow(['CORS error in console', 'Update CLIENT_URL in backend Variables to match exact frontend URL'], [3600, 5760]),
          dataRow(['Backend offline', 'Railway > backend > Deployments > Redeploy'], [3600, 5760], true),
          dataRow(['Messages not appearing', 'Refresh the page; check Railway backend logs for errors'], [3600, 5760]),
          dataRow(['Users not getting push notifications', 'Verify VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT are set in Railway backend Variables'], [3600, 5760], true),
          dataRow(['Link previews / images blocked in console (CSP)', 'Check the Content-Security-Policy in frontend/serve.js allows the domain in question'], [3600, 5760]),
          dataRow(['Desktop release publish fails', 'Confirm GH_TOKEN has repo scope and hasn’t expired; Linux builds need WSL/Docker (see Section 13)'], [3600, 5760], true),
          dataRow(['User says they never got a password reset email', 'If RESEND_API_KEY is unset or the send fails, the reset link is printed to the backend’s Railway logs instead — search logs for "password-reset"'], [3600, 5760]),
        ],
      }),
      spacer(200),

      // ─── FOOTER NOTE ─────────────────────────────────────────
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'DDDDDD', space: 8 } },
        spacing: { before: 160, after: 0 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'The Crows Nest is hosted on Railway.app  •  React • Node.js • Socket.io • PostgreSQL • LiveKit', font: 'Arial', size: 18, color: 'B5BAC1' })],
      }),
    ],
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync('CrowsNest-Admin-Guide.docx', buffer);
  console.log('Created: CrowsNest-Admin-Guide.docx');
});
