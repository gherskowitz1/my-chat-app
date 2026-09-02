const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, LevelFormat,
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
        borders: { top: { style: BorderStyle.NONE, size: 0, color: WHITE }, bottom: { style: BorderStyle.NONE, size: 0, color: WHITE }, left: { style: BorderStyle.NONE, size: 0, color: WHITE }, right: { style: BorderStyle.NONE, size: 0, color: WHITE } },
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
            new TextRun({ text: '— User Guide', font: 'Arial', size: 20, color: '80848E' }),
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
        children: [new TextRun({ text: 'User Guide', font: 'Arial', size: 36, color: DARK })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Everything you need to chat, call, and connect', font: 'Arial', size: 22, color: '80848E' })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
        children: [new TextRun({ text: `Version 4.0  •  ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}`, font: 'Arial', size: 20, color: 'B5BAC1' })],
      }),
      spacer(1200),

      // ─── SECTION 1: GETTING STARTED ─────────────────────────
      heading1('1. Getting Started'),
      heading2('1.1 Creating Your Account'),
      step('Open your browser and go to The Crows Nest server URL (your admin will share this with you)'),
      step('Click Create Account'),
      step('Fill in your username (2–32 characters), email address, and a password (8+ characters)'),
      step('Click Create Account — you are logged in immediately'),
      spacer(80),
      note('You only need to sign up once. Next time, click Log In and use your email and password.', 'info'),
      spacer(160),

      heading2('1.2 Logging In, Out, and Remember Me'),
      bullet('Log in: enter your email and password on the login screen'),
      bullet('Remember Me: check this box to stay signed in on this device without re-entering your password each time'),
      bullet('Log out: click the arrow icon at the very bottom of the left sidebar'),
      spacer(80),
      note('Your session stays active for 180 days either way. You will be logged out automatically after that.', 'info'),
      spacer(160),

      heading2('1.3 Inviting Friends'),
      body('Anyone can invite someone new — you do not need to be an admin:'),
      step('Click the Invite button at the top of the channel sidebar'),
      step('Enter your friend’s email address'),
      step('Click Send Invite'),
      spacer(80),
      note('They’ll get an email with a direct link straight to the signup page, with their email already filled in.', 'info'),
      spacer(200),

      // ─── SECTION 2: NAVIGATING ───────────────────────────────
      heading1('2. Navigating the App'),
      body('The Crows Nest has four main areas visible at all times:'),
      spacer(40),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2800, 6560],
        rows: [
          headerRow(['Area', 'What It Is'], [2800, 6560]),
          dataRow(['Far-left sidebar', 'Switch between the server and direct messages. Your avatar (with your status dot) is here too.'], [2800, 6560]),
          dataRow(['Channel / DM list', 'Lists all text channels, voice channels, or your DM conversations — with unread dots and badges.'], [2800, 6560], true),
          dataRow(['Main area', 'The chat window, voice room, or empty state when nothing is selected'], [2800, 6560]),
          dataRow(['Member list', 'Online / away / offline members shown on the right side of text channels'], [2800, 6560], true),
        ],
      }),
      spacer(160),

      heading2('2.1 Switching Between Server and Direct Messages'),
      bullet('Click the envelope icon at the top of the far-left sidebar to go to Direct Messages'),
      bullet('Click the G server button below it to go back to the main server channels'),
      bullet('A small red dot appears on either icon when there’s unread activity in that section'),
      spacer(200),

      // ─── SECTION 3: TEXT CHANNELS ────────────────────────────
      heading1('3. Text Channels'),
      heading2('3.1 Sending a Message'),
      step('Click any text channel (starting with #) in the sidebar — note that some channels may be private and only visible if you’ve been given access'),
      step('Click in the message box at the bottom of the screen'),
      step('Type your message and press Enter, or click the send button'),
      spacer(80),
      note('Messages can be up to 2,000 characters, plus optional file attachments (see Section 3.12).', 'info'),
      spacer(160),

      heading2('3.2 Editing and Deleting Your Own Messages'),
      bullet('Hover over your message — an edit (pencil) icon and a trash icon appear on the right'),
      bullet('Click the pencil to edit it in place: change the text, press Enter to save or Escape to cancel'),
      bullet('Click the trash icon to permanently delete it'),
      spacer(80),
      note('You can only edit or delete your own messages. Admins can delete anyone’s messages (see the Administrator Guide).', 'info'),
      spacer(160),

      heading2('3.3 Multi-line Messages'),
      body('Press Shift+Enter to add a new line without sending — handy for longer messages or lists. Plain Enter still sends.'),
      spacer(160),

      heading2('3.4 Typing Indicators'),
      body('When you start typing, other users in the same channel see a "... is typing" indicator at the bottom of the chat. It disappears automatically after 2 seconds when you stop typing.'),
      spacer(160),

      heading2('3.5 Message Grouping'),
      body('Consecutive messages from the same person sent within 5 minutes are grouped together — the avatar and username only appear on the first message to keep the chat clean and readable.'),
      spacer(160),

      heading2('3.6 Mentioning Someone'),
      step('Type @ followed by a few letters of their name — a dropdown of matching users appears'),
      step('Use the arrow keys and Enter (or click) to pick someone, or pick everyone with @everyone to notify the whole channel'),
      step('Click any @mention in a message (yours or someone else’s) to see that person’s profile card, with a Message button to jump straight into a DM with them'),
      spacer(80),
      note('Being @mentioned (or an @everyone) highlights the message for you, shows a red badge on that channel, pops an in-app toast, and — in the desktop app, or anywhere with push notifications enabled — a system notification too.', 'info'),
      spacer(160),

      heading2('3.7 Reactions'),
      body('Hover over any message and click the smiley (Add reaction) icon to react with an emoji. Click an existing reaction on a message to add or remove your own — hover one to see who else reacted.'),
      spacer(160),

      heading2('3.8 Replying to a Message'),
      step('Hover over a message and click Reply'),
      step('Type your response — it sends attached to the original with a quoted preview above it'),
      step('Click that quoted preview at any time to jump straight back to the original message'),
      spacer(160),

      heading2('3.9 Pinned Messages'),
      body('Admins can pin an important message to a channel by hovering it and clicking the pin icon — click the pin icon again to unpin. Everyone can click the pinned-messages icon in the channel header to see the full list and jump to any of them.'),
      spacer(160),

      heading2('3.10 Searching Messages'),
      step('Click the magnifying-glass (Search Messages) icon in the far-left sidebar'),
      step('Type your search term'),
      step('Choose a scope: Everywhere, Channels, or Direct Messages'),
      step('Click any result to jump straight to that message'),
      spacer(160),

      heading2('3.11 Custom Server Emoji'),
      body('In addition to standard emoji, your server may have its own custom ones. Type a colon (:) followed by a few letters of the emoji’s name to see matching custom emoji, and use one the same way you would type :name: — it renders as an image both inline in your message and as a reaction option.'),
      spacer(160),

      heading2('3.12 File & Image Attachments'),
      step('Click the paperclip (Attach a file) icon next to the message box, or paste an image straight from your clipboard (Ctrl+V)'),
      step('Your file appears staged above the message box — add more (up to 5 per message) or remove one with its ✕'),
      step('Type an optional caption and press Enter to send'),
      step('Click any image attachment in the chat to view it full-size'),
      spacer(80),
      note('Attachments share an 8MB combined limit per message. This works the same way in both channels and direct messages.', 'info'),
      spacer(160),

      heading2('3.13 Drafts & Sending While Offline'),
      body('Whatever you’ve typed but not sent is saved automatically per channel — switch away and come back later, even after closing the app, and it’s still there waiting in the message box.'),
      spacer(80),
      note('If your connection drops right as you hit send, the message is held on your device and delivered automatically the moment you’re back online — even across a reload. A message stuck like this shows as "pending"; if it ever shows as "failed" instead, click it to retry.', 'info'),
      spacer(160),

      heading2('3.14 Link Previews'),
      body('Paste a link and it becomes clickable automatically. Certain links also get a rich preview underneath the message:'),
      bullet('YouTube, Twitch (clips, VODs, live channels), and Vimeo — click-to-play thumbnail'),
      bullet('Spotify and SoundCloud — an inline player'),
      bullet('Direct image links (.png, .jpg, .gif, .webp) — an inline image preview'),
      spacer(200),

      // ─── SECTION 4: DIRECT MESSAGES ─────────────────────────
      heading1('4. Direct Messages'),
      heading2('4.1 Starting a New Conversation'),
      step('Click the envelope icon in the far-left sidebar to go to Direct Messages'),
      step('Click the + button at the top of the DM list'),
      step('A list of all users appears — click the person you want to message'),
      step('The conversation opens and is added to your DM list'),
      spacer(80),
      note('You can also start a DM by clicking someone’s @mention or avatar anywhere in the app and hitting Message on their profile card.', 'info'),
      spacer(160),

      heading2('4.2 Sending a Direct Message'),
      bullet('Click the conversation in the DM list on the left'),
      bullet('Type in the message box at the bottom and press Enter — messages are delivered in real time'),
      spacer(160),

      heading2('4.3 Editing and Deleting Messages'),
      body('Same as text channels — hover your message for edit and delete icons. You can only edit or delete your own DMs.'),
      spacer(160),

      heading2('4.4 Typing Indicators in DMs'),
      body('The same typing indicator as text channels works in DMs — when the other person is typing, you will see their name appear at the bottom of the conversation.'),
      spacer(160),

      heading2('4.5 Friends'),
      step('Click the Friends icon in the far-left sidebar'),
      step('Search for someone and click Add Friend to send a request'),
      step('They’ll see it under Pending — Accept or Decline it there; you can also Remove an existing friend at any time'),
      spacer(80),
      note('Friends are just a list for keeping track of people — you can already direct-message anyone on the server whether or not you’re friends.', 'info'),
      spacer(200),

      // ─── SECTION 5: VOICE & VIDEO ────────────────────────────
      heading1('5. Voice & Video Channels'),
      heading2('5.1 Joining a Voice Channel'),
      step('Click a voice channel in the sidebar (shown with a microphone icon)'),
      step('Click Join Voice — your browser will ask for microphone permission'),
      step('Click Allow — you are now connected and can speak with others in the channel'),
      spacer(80),
      note('Your browser must have permission to access your microphone. If denied, go to your browser settings and allow microphone access for this site.', 'warning'),
      spacer(160),

      heading2('5.2 Leaving a Voice Channel'),
      body('Click the Leave button in the control bar at the bottom of the room to disconnect immediately.'),
      spacer(160),

      heading2('5.3 Voice Controls'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2200, 1800, 5360],
        rows: [
          headerRow(['Control', 'Shortcut', 'What It Does'], [2200, 1800, 5360]),
          dataRow(['Mute', 'M', 'Toggles your microphone. When muted, others cannot hear you.'], [2200, 1800, 5360]),
          dataRow(['Deafen', 'D', 'Mutes your microphone and stops you from hearing anyone else at the same time.'], [2200, 1800, 5360], true),
          dataRow(['Push to Talk', 'Hold Space', 'Hold the key to transmit; release to go back to muted.'], [2200, 1800, 5360]),
          dataRow(['Leave', 'Esc', 'Disconnects you from the voice channel immediately.'], [2200, 1800, 5360], true),
        ],
      }),
      spacer(160),

      heading2('5.4 Turning on Your Camera'),
      body('Click the camera icon in the control bar to turn on your webcam — click it again to turn it off.'),
      spacer(160),

      heading2('5.5 Sharing Your Screen'),
      step('Click Share Screen in the control bar'),
      step('A picker appears listing every screen and open window (including games) you can share'),
      step('Choose one and click Share (double-click also works)'),
      step('Click Stop Sharing to end it'),
      spacer(80),
      body('Whoever is watching sees your share in its own floating window that they can drag, resize, minimize, maximize, or expand to full screen. A quality-mode toggle lets you favor Detail (sharper, for reading text) or Motion (smoother, for fast-moving video/games).'),
      spacer(80),
      note('In the desktop app, sharing includes your computer’s system audio automatically (Windows only) — so background music or game sound comes through too, not just what’s on screen.', 'info'),
      spacer(160),

      heading2('5.6 Volume Mixer'),
      body('When other people are in the voice channel with you, a Volume Mixer panel lets you control how loud each person sounds to you personally — a slider (up to 200%) and a mute toggle per person. It only affects your own audio.'),
      spacer(160),

      heading2('5.7 Join/Leave Chimes & the Away Channel'),
      body('You’ll hear a short chime when someone joins or leaves your current voice channel, and a different one when you get a new direct message. If you’re connected to voice with no keyboard/mouse activity for 4 hours, you’re automatically moved to a muted "taking-a-shit" channel to free up the room — rejoin normally whenever you’re back.'),
      spacer(160),

      heading2('5.8 Voice Effects'),
      step('Click the Voice Effects icon in the control bar'),
      step('Pick an effect — Robot, Alien, Chipmunk, Helium, Deep Voice, Demon, Echo, Reverb, Telephone, Radio, Broken Radio, Underwater, Whisper, or Megaphone'),
      step('Click 🎧 Hear Yourself to preview it privately before committing — only you hear the preview'),
      spacer(80),
      note('Everyone else in the channel hears the effect applied to your live voice the moment you pick it; switch or turn it off mid-call any time.', 'info'),
      spacer(160),

      heading2('5.9 Soundboard'),
      step('Click Soundboard in the control bar to open the panel'),
      step('Click a clip to play it for everyone in the channel, or use its preview button to hear it privately first'),
      step('Adjust each clip’s own volume slider to taste — this only affects how loud it plays for you'),
      spacer(80),
      note('Not every browser can broadcast soundboard clips to others — if yours can’t, clips still play, just only for you.', 'warning'),
      spacer(160),

      heading2('5.10 Choosing How Your Mic Activates'),
      body('In User Settings > Audio, pick how your microphone turns on:'),
      bullet('Open Mic — always transmitting unless you manually mute'),
      bullet('Push to Talk — hold a key (Space by default; rebindable under Shortcuts) to transmit, muted otherwise'),
      bullet('Voice Activity — transmits automatically whenever you’re actually speaking, with an adjustable sensitivity'),
      spacer(200),

      // ─── SECTION 6: NOTIFICATIONS ─────────────────────────────
      heading1('6. Notifications'),
      heading2('6.1 Desktop Notifications'),
      body('In the desktop app only, you’ll get an OS-level notification for new messages, @mentions, and when someone joins or leaves a voice channel you’re in — click a notification to jump straight to it.'),
      spacer(160),

      heading2('6.2 Unread Badges'),
      bullet('A channel with unread messages shows in bold with a small dot'),
      bullet('A channel where you were @mentioned (or @everyone was used) shows a red badge with a count instead'),
      bullet('Unread DMs show the same red count badge in the DM list'),
      bullet('The DM and Server icons in the far-left sidebar get a small red dot if there’s unread activity you’re not currently looking at'),
      spacer(160),

      heading2('6.3 In-App Toast Alerts'),
      body('A dismissible pop-up appears in the bottom-right for new DMs and channel @mentions, in both the browser and desktop app — click it to jump straight to that conversation.'),
      spacer(160),

      heading2('6.4 Push Notifications (Even With the App Closed)'),
      step('Open User Settings and turn on notifications when prompted by your browser'),
      step('Accept the browser’s permission prompt (this only needs to happen once per device)'),
      spacer(80),
      body('From then on, a new direct message or an @mention reaches you as a real notification even if you’ve fully closed the tab or app — tapping it opens straight to that conversation. Only DMs and mentions ever send a push notification; regular channel activity you’re not tagged in never will.'),
      spacer(80),
      note('This works on desktop browsers and, once installed to your phone’s home screen (Section 11.2), on an iPhone or Android too.', 'info'),
      spacer(200),

      // ─── SECTION 7: YOUR STATUS ────────────────────────────────
      heading1('7. Your Status'),
      heading2('7.1 Automatic Status'),
      body('You show as Online while active, and automatically switch to Away after 30 minutes with no mouse or keyboard activity anywhere in the app.'),
      spacer(160),

      heading2('7.2 Manually Setting Your Status'),
      step('Click your avatar to open User Settings'),
      step('Go to the Status tab'),
      step('Pick Online, Away, or Offline (appear offline while still fully connected)'),
      spacer(80),
      note('A manual status overrides automatic detection for the rest of your session and resets back to automatic the next time you sign in.', 'info'),
      spacer(200),

      // ─── SECTION 8: USER SETTINGS ────────────────────────────
      heading1('8. User Settings & Audio Devices'),
      body('Click your avatar (bottom of the far-left sidebar) to open User Settings.'),
      spacer(80),

      heading2('8.1 Switching Your Microphone'),
      step('Open User Settings, under Input Device (Microphone) click the dropdown'),
      step('Select your preferred microphone'),
      step('Click Test Microphone to verify it is working (records for 3 seconds)'),
      step('Click Save Changes'),
      spacer(80),
      note('Your selection is saved in your browser and automatically used the next time you join a voice channel.', 'info'),
      spacer(160),

      heading2('8.2 Switching Your Speaker or Headphones'),
      body('In User Settings, find Output Device (Speakers / Headphones), pick your device, and Save Changes.'),
      spacer(80),
      note('Output device switching requires Chrome or Edge. Firefox does not support this feature.', 'warning'),
      spacer(160),

      heading2('8.3 Changing Your Profile Picture'),
      body('Click your avatar in User Settings (or in the header) and choose Change Photo to upload a new picture, or Remove to go back to your colored-initial avatar.'),
      spacer(160),

      heading2('8.4 Light / Dark Theme'),
      body('In User Settings > Appearance, switch between light and dark theme any time — it applies immediately and is remembered on that device.'),
      spacer(200),

      // ─── SECTION 9: PRIVATE CHANNELS ──────────────────────────
      heading1('9. Private Channels'),
      body('Some channels may be marked private by an admin — visible and usable only to a specific group of people. If you can’t find a channel you were expecting, ask an admin to add you to it; you won’t be able to tell a private channel exists unless you already have access.'),
      spacer(200),

      // ─── SECTION 10: PATCHBOT ──────────────────────────────────
      heading1('10. Game Update Notifications (PatchBot)'),
      body('If an admin has set it up, a channel may automatically post Steam update / patch notes for specific games — these show up as regular messages from a PatchBot account, complete with a summary and a link to the full post. Click the controller icon in a text channel’s header to see which games are tracked there.'),
      spacer(200),

      // ─── SECTION 11: DESKTOP APP ─────────────────────────────
      heading1('11. Desktop App (Windows & Linux)'),
      body('You can install The Crows Nest as a full desktop application — download it from the login page, which has both a Windows and a Linux installer.'),
      spacer(80),

      heading2('11.1 Installing the Desktop App'),
      step('Download the Windows (.exe) or Linux (.AppImage) installer from the login page'),
      step('Windows: double-click Setup.exe and click through the installer. Linux: mark the AppImage executable and run it'),
      step('Once installed, The Crows Nest appears in your Start menu / app launcher and on your desktop'),
      step('Open it — it loads directly to The Crows Nest'),
      spacer(80),
      note('The app checks for updates automatically in the background and installs them the next time you restart it. A macOS build isn’t published yet — Mac users should use the browser or the installable web app below in the meantime.', 'info'),
      spacer(160),

      heading2('11.2 Installing as a Web App (No Download Required)'),
      body('The Crows Nest can also be installed straight from your browser, on a phone or a computer, without downloading anything from the login page:'),
      bullet('Phone (iOS/Android): open the site in your browser, then use the browser’s Share/menu > Add to Home Screen (or click the Install App icon in the sidebar if your browser shows one) — it then opens full-screen like a normal app'),
      bullet('Desktop browser (Chrome/Edge): click the Install App icon in the far-left sidebar, or the install icon in the address bar'),
      spacer(80),
      note('This is the easiest way to get push notifications and a real app icon on a phone, and works even where a native installer isn’t available (Mac, Chromebook, etc.).', 'info'),
      spacer(160),

      heading2('11.3 Desktop vs Browser'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [4000, 2680, 2680],
        rows: [
          headerRow(['Feature', 'Desktop App', 'Browser'], [4000, 2680, 2680]),
          dataRow(['All chat features', 'Yes', 'Yes'], [4000, 2680, 2680]),
          dataRow(['Runs without a browser tab', 'Yes', 'No'], [4000, 2680, 2680], true),
          dataRow(['Lives in taskbar / minimizes to tray', 'Yes', 'No'], [4000, 2680, 2680]),
          dataRow(['Desktop (OS-level) notifications', 'Yes', 'No'], [4000, 2680, 2680], true),
          dataRow(['Screen share includes system audio', 'Yes (Windows)', 'No'], [4000, 2680, 2680]),
          dataRow(['Same account / messages', 'Yes', 'Yes'], [4000, 2680, 2680], true),
        ],
      }),
      spacer(200),

      // ─── SECTION 12: TIPS ─────────────────────────────────────
      heading1('12. Tips & Shortcuts'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3400, 5960],
        rows: [
          headerRow(['Tip', 'Detail'], [3400, 5960]),
          dataRow(['Press Enter to send', 'Shift+Enter for a new line without sending'], [3400, 5960]),
          dataRow(['@ to mention', 'Type @ for autocomplete; @everyone pings the whole channel'], [3400, 5960], true),
          dataRow(['Click a mention', 'See their profile card and jump straight into a DM'], [3400, 5960]),
          dataRow(['Grouped messages', 'Rapid messages from the same person stack together cleanly'], [3400, 5960], true),
          dataRow(['Member list toggle', 'Click the people icon in the channel header to hide / show it'], [3400, 5960]),
          dataRow(['Status dots', 'Green = online, yellow = away, grey = offline'], [3400, 5960], true),
          dataRow(['Appear offline', 'Set a manual status in User Settings > Status'], [3400, 5960]),
          dataRow(['Boost quiet speakers', 'Use the Volume Mixer slider past 100%'], [3400, 5960], true),
          dataRow(['Test your mic first', 'User Settings > Test Microphone before joining important calls'], [3400, 5960]),
          dataRow(['DM anyone', 'Not just people in your channels — click + in the DM list'], [3400, 5960], true),
          dataRow(['Stay signed in', 'Remember Me at login, or just wait — sessions last 180 days either way'], [3400, 5960]),
          dataRow(['Paste an image to share it', 'Ctrl+V in the message box works instead of using the attach button'], [3400, 5960], true),
          dataRow(['Sent something during a drop?', 'It’s held on your device and sent automatically once you’re back online'], [3400, 5960]),
          dataRow(['Find an old message fast', 'Click the search icon in the sidebar instead of scrolling'], [3400, 5960], true),
          dataRow(['Preview a voice effect first', '🎧 Hear Yourself in Voice Effects before switching for the whole call'], [3400, 5960]),
        ],
      }),
      spacer(200),

      // ─── SECTION 13: TROUBLESHOOTING ─────────────────────────
      heading1('13. Troubleshooting'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3600, 5760],
        rows: [
          headerRow(['Problem', 'Solution'], [3600, 5760]),
          dataRow(['Cannot log in', 'Check your email and password. Use Log In, not Create Account.'], [3600, 5760]),
          dataRow(['Messages not loading', 'Refresh the page (F5 or Ctrl+R)'], [3600, 5760], true),
          dataRow(['Cannot hear others in voice', 'Check your speaker/headphone selection in User Settings'], [3600, 5760]),
          dataRow(['Others cannot hear you', 'Check microphone permission in browser settings; test mic in User Settings'], [3600, 5760], true),
          dataRow(['Not seeing a channel you expect', 'It may be private — ask an admin to add you'], [3600, 5760]),
          dataRow(['Not getting desktop notifications', 'Desktop notifications only work in the desktop app, not the browser'], [3600, 5760], true),
          dataRow(['Status stuck on Away/Offline', 'Check User Settings > Status — a manual override resets at your next login'], [3600, 5760]),
          dataRow(['App says "Failed to fetch"', 'The server may be restarting. Wait 30 seconds and refresh.'], [3600, 5760], true),
          dataRow(['Desktop app won’t open', 'Windows: Run as Administrator or reinstall. Linux: re-mark the AppImage executable.'], [3600, 5760]),
          dataRow(['Output dropdown missing', 'Output device switching requires Chrome or Edge, not Firefox'], [3600, 5760], true),
          dataRow(['"Message too large" on send', 'Attachments share an 8MB combined limit per message — split into two messages'], [3600, 5760]),
          dataRow(['Not getting push notifications', 'Check your browser/OS notification permission for the site; re-enable it in User Settings'], [3600, 5760], true),
          dataRow(['No Install App icon in the sidebar', 'Your browser may not support installable apps, or it’s already installed — check your browser or home screen'], [3600, 5760]),
        ],
      }),
      spacer(160),
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'DDDDDD', space: 8 } },
        spacing: { before: 160, after: 0 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Need help? Contact your server admin.', font: 'Arial', size: 18, color: 'B5BAC1' })],
      }),
    ],
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync('CrowsNest-User-Guide.docx', buffer);
  console.log('Created: CrowsNest-User-Guide.docx');
});
