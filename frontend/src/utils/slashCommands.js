// Slash commands typed at the start of a message, e.g. "/shrug" or
// "/roll 2d6". runSlashCommand turns the composer's text into either a
// message to send, or an action for the composer to perform (open the GIF
// picker / poll composer). Anything that isn't a known command — including
// things like "/r/gaming" — is left alone and sent as typed.
//
// Dice and coin results are generated on the sender's machine and sent as
// ordinary message text — fine for fun, but not tamper-proof.

const MAX_DICE = 20;
const MAX_SIDES = 1000;

function rollDice(arg) {
  const m = (arg || '1d6').trim().toLowerCase().match(/^(\d*)d(\d+)$/);
  if (!m) return { error: 'Use dice like 1d20 or 2d6.' };
  const count = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2], 10);
  if (count < 1 || count > MAX_DICE || sides < 2 || sides > MAX_SIDES) {
    return { error: `Roll 1-${MAX_DICE} dice with 2-${MAX_SIDES} sides.` };
  }
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
  const total = rolls.reduce((a, b) => a + b, 0);
  const detail = count > 1 ? `${rolls.join(' + ')} = **${total}**` : `**${total}**`;
  return { send: `🎲 rolled ${count}d${sides}: ${detail}` };
}

const withText = (face) => (arg) => ({ send: arg ? `${arg} ${face}` : face });

export const SLASH_COMMANDS = [
  { name: 'shrug', args: '[message]', description: 'Adds ¯\\_(ツ)_/¯', run: withText('¯\\_(ツ)_/¯') },
  { name: 'tableflip', args: '[message]', description: 'Adds (╯°□°)╯︵ ┻━┻', run: withText('(╯°□°)╯︵ ┻━┻') },
  { name: 'unflip', args: '[message]', description: 'Adds ┬─┬ノ( º _ ºノ)', run: withText('┬─┬ノ( º _ ºノ)') },
  { name: 'lenny', args: '[message]', description: 'Adds ( ͡° ͜ʖ ͡°)', run: withText('( ͡° ͜ʖ ͡°)') },
  {
    name: 'me', args: '<action>', description: 'Say it as an action, in italics',
    run: (arg) => (arg ? { send: `_${arg}_` } : { error: 'Type an action after /me.' }),
  },
  {
    name: 'spoiler', args: '<text>', description: 'Hide the message until someone clicks it',
    run: (arg) => (arg ? { send: `||${arg}||` } : { error: 'Type the spoiler after /spoiler.' }),
  },
  { name: 'roll', args: '[dice, e.g. 2d6]', description: 'Roll dice (default 1d6)', run: rollDice },
  {
    name: 'flip', args: '', description: 'Flip a coin',
    run: () => ({ send: `🪙 flipped a coin: **${Math.random() < 0.5 ? 'Heads' : 'Tails'}**` }),
  },
  { name: 'gif', args: '[search]', description: 'Search for a GIF', run: (arg) => ({ action: 'gif', query: arg }) },
  { name: 'poll', args: '', description: 'Create a poll', channelOnly: true, run: () => ({ action: 'poll' }) },
];

export function commandsFor({ isDM }) {
  return isDM ? SLASH_COMMANDS.filter((c) => !c.channelOnly) : SLASH_COMMANDS;
}

// Returns null when `text` isn't a known command (send it as typed),
// otherwise { send } | { action, query } | { error }.
export function runSlashCommand(text, { isDM }) {
  const m = text.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  const cmd = commandsFor({ isDM }).find((c) => c.name === m[1].toLowerCase());
  if (!cmd) return null;
  return cmd.run((m[2] || '').trim());
}
