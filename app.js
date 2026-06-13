import {
  Client, GatewayIntentBits, Partials, Events, SlashCommandBuilder,
  PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ChannelType, REST, Routes, Collection,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder
} from 'discord.js';
import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';

config();

// ── Data helpers (JSON-file store, no DB needed) ──────────────────────────────
const DATA_FILE = './data.json';
const defaultData = { tickets: {}, concerts: [], reactionRoles: {} };

function loadData() {
  if (!existsSync(DATA_FILE)) saveData(defaultData);
  try { return JSON.parse(readFileSync(DATA_FILE, 'utf8')); }
  catch { return { ...defaultData }; }
}
function saveData(d) { writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

// ── Constants ─────────────────────────────────────────────────────────────────
const TICKET_CATEGORY   = '1515398439658323978';
const REACTION_CHANNEL  = '1515382046342775034';
const LOG_CHANNEL       = '1515389472034914324';
const INSTAGRAM_URL     = 'https://www.instagram.com/noise.education.band';
const STAFF_ROLE_PERMS  = PermissionFlagsBits.ManageGuild;

// ── Client ────────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ── Slash commands ────────────────────────────────────────────────────────────
const commands = [
  // Ticket panel
  new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Send the ticket panel')
    .setDefaultMemberPermissions(STAFF_ROLE_PERMS),

  // Close ticket
  new SlashCommandBuilder()
    .setName('closeticket')
    .setDescription('Close the current ticket')
    .setDefaultMemberPermissions(STAFF_ROLE_PERMS),

  // Reaction role setup
  new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Add a reaction-role mapping to a message')
    .setDefaultMemberPermissions(STAFF_ROLE_PERMS)
    .addStringOption(o => o.setName('message_id').setDescription('Message ID in the reaction channel').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji to react with').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true)),

  // Clear
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete messages (default: last message)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('amount').setDescription('Number of messages OR "all"').setRequired(false))
    .addUserOption(o => o.setName('user').setDescription('Only delete messages from this user').setRequired(false))
    .addStringOption(o => o.setName('before').setDescription('Delete messages before this message ID').setRequired(false)),

  // Instagram
  new SlashCommandBuilder()
    .setName('instagram')
    .setDescription('Get our Instagram link'),

  // Concerts
  new SlashCommandBuilder()
    .setName('concerts')
    .setDescription('Show next 5 upcoming concerts'),

  // Concert add
  new SlashCommandBuilder()
    .setName('concert')
    .setDescription('Manage concerts')
    .setDefaultMemberPermissions(STAFF_ROLE_PERMS)
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a concert')
      .addStringOption(o => o.setName('date').setDescription('Date (e.g. 2025-07-20)').setRequired(true))
      .addStringOption(o => o.setName('time').setDescription('Time (e.g. 20:00)').setRequired(true))
      .addStringOption(o => o.setName('location').setDescription('Location').setRequired(true))
      .addStringOption(o => o.setName('info').setDescription('Additional information').setRequired(false)))
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a concert by index (use /concerts to see indices)')
      .addIntegerOption(o => o.setName('index').setDescription('Concert number from /concerts list').setRequired(true))),

  new SlashCommandBuilder()
    .setName('rolemessage')
    .setDescription('Send the reaction-role message into the reaction channel')
    .setDefaultMemberPermissions(STAFF_ROLE_PERMS),
].map(c => c.toJSON());

// ── Register commands ─────────────────────────────────────────────────────────
async function registerCommands(guildId) {
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
  console.log(`[CMD] Registered ${commands.length} commands in guild ${guildId}`);
}

// ── Logging helper ────────────────────────────────────────────────────────────
async function log(guild, embed) {
  const ch = guild.channels.cache.get(LOG_CHANNEL);
  if (ch?.isTextBased()) ch.send({ embeds: [embed] }).catch(() => {});
}

function logEmbed(color, title, fields = [], footer = '') {
  const e = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();
  if (fields.length) e.addFields(fields);
  if (footer) e.setFooter({ text: footer });
  return e;
}

// ── READY ─────────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
  console.log(`[BOT] Logged in as ${client.user.tag}`);
  client.guilds.cache.forEach(g => registerCommands(g.id).catch(console.error));
});

// ── INTERACTION handler ───────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async interaction => {
  // ── Buttons ────────────────────────────────────────────────────────────────
  if (interaction.isButton()) {
    if (interaction.customId === 'create_ticket') return handleCreateTicket(interaction);
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  // ── /ticketpanel ──────────────────────────────────────────────────────────
  if (commandName === 'ticketpanel') {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎫 Support Tickets')
      .setDescription('Click the button below to open a support ticket.\nOur team will get back to you as soon as possible.');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('create_ticket').setLabel('Open Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
    );
    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Panel sent.', ephemeral: true });
    return;
  }

  // ── /closeticket ─────────────────────────────────────────────────────────
  if (commandName === 'closeticket') {
    const data = loadData();
    const ticket = data.tickets[interaction.channel.id];
    if (!ticket) return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });

    await interaction.reply('🔒 Closing ticket in 5 seconds…');
    setTimeout(async () => {
      delete data.tickets[interaction.channel.id];
      saveData(data);
      await interaction.channel.delete().catch(() => {});
    }, 5000);
    return;
  }

  // ── /reactionrole ─────────────────────────────────────────────────────────
  if (commandName === 'reactionrole') {
    const msgId  = interaction.options.getString('message_id');
    const emoji  = interaction.options.getString('emoji');
    const role   = interaction.options.getRole('role');
    const ch     = interaction.guild.channels.cache.get(REACTION_CHANNEL);
    if (!ch) return interaction.reply({ content: '❌ Reaction channel not found.', ephemeral: true });

    let msg;
    try { msg = await ch.messages.fetch(msgId); }
    catch { return interaction.reply({ content: '❌ Message not found.', ephemeral: true }); }

    await msg.react(emoji).catch(() => {});

    const data = loadData();
    if (!data.reactionRoles[msgId]) data.reactionRoles[msgId] = {};
    data.reactionRoles[msgId][emoji] = role.id;
    saveData(data);

    await interaction.reply({ content: `✅ Reaction role set: ${emoji} → ${role}`, ephemeral: true });
    return;
  }

  // ── /clear ────────────────────────────────────────────────────────────────
  if (commandName === 'clear') {
    await interaction.deferReply({ ephemeral: true });
    const amountRaw = interaction.options.getString('amount');
    const targetUser = interaction.options.getUser('user');
    const beforeId   = interaction.options.getString('before');
    const ch = interaction.channel;

    // Default: delete last 1 message
    if (!amountRaw && !targetUser && !beforeId) {
      const msgs = await ch.messages.fetch({ limit: 1 });
      if (msgs.size) await ch.bulkDelete(msgs).catch(() => {});
      return interaction.editReply('✅ Deleted last message.');
    }

    const deleteAll = amountRaw?.toLowerCase() === 'all';
    const limit     = deleteAll ? 100 : Math.min(parseInt(amountRaw) || 100, 100);

    let fetchOptions = { limit };
    if (beforeId) fetchOptions.before = beforeId;

    let deleted = 0;
    let lastId  = beforeId || null;

    // Bulk delete loop (Discord only allows messages < 14 days old for bulkDelete)
    let keepGoing = true;
    while (keepGoing) {
      const opts = { limit: 100 };
      if (lastId) opts.before = lastId;

      const fetched = await ch.messages.fetch(opts).catch(() => new Collection());
      if (!fetched.size) break;

      let toDelete = fetched;
      if (targetUser) toDelete = fetched.filter(m => m.author.id === targetUser.id);

      // Remove messages older than 14 days (bulkDelete restriction)
      const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const eligible = toDelete.filter(m => m.createdTimestamp > cutoff);

      if (eligible.size) {
        const batch = deleteAll ? eligible : eligible.first(limit - deleted);
        const del = await ch.bulkDelete(batch, true).catch(() => new Collection());
        deleted += del.size;
      }

      lastId = fetched.last()?.id;

      if (!deleteAll && deleted >= limit) keepGoing = false;
      if (fetched.size < 100) keepGoing = false;
    }

    return interaction.editReply(`✅ Deleted **${deleted}** message(s).`);
  }

  // ── /instagram ────────────────────────────────────────────────────────────
  if (commandName === 'instagram') {
    const iconURL = interaction.guild.iconURL({ dynamic: true });
    const embed = new EmbedBuilder()
      .setColor(0xE1306C)
      .setTitle('📸 Noise Education on Instagram')
      .setDescription(`Follow us for updates!\n\n🔗 ${INSTAGRAM_URL}`);
    if (iconURL) embed.setThumbnail(iconURL);
    return interaction.reply({ embeds: [embed] });
  }

  // ── /concerts ─────────────────────────────────────────────────────────────
  if (commandName === 'concerts') {
    const data = loadData();
    const now = Date.now();
    const upcoming = data.concerts
      .filter(c => { const t = new Date(`${c.date}T${c.time}`).getTime(); return isNaN(t) || t >= now; })
      .sort((a, b) => {
        const ta = new Date(`${a.date}T${a.time}`).getTime();
        const tb = new Date(`${b.date}T${b.time}`).getTime();
        if (isNaN(ta) && isNaN(tb)) return 0;
        if (isNaN(ta)) return 1;
        if (isNaN(tb)) return -1;
        return ta - tb;
      })
      .slice(0, 5);

    if (!upcoming.length) return interaction.reply({ content: '📅 No upcoming concerts scheduled.', ephemeral: true });

    const iconURL = interaction.guild.iconURL({ dynamic: true });
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🎸 Upcoming Concerts').setTimestamp();
    if (iconURL) embed.setThumbnail(iconURL);
    upcoming.forEach((c, i) => {
      embed.addFields({
        name: `#${i + 1} — ${c.date} @ ${c.time}`,
        value: `📍 ${c.location}${c.info ? `\nℹ️ ${c.info}` : ''}`,
      });
    });
    return interaction.reply({ embeds: [embed] });
  }

  // ── /concert add | remove ─────────────────────────────────────────────────
  if (commandName === 'concert') {
    const sub = interaction.options.getSubcommand();
    const data = loadData();

    if (sub === 'add') {
      const concert = {
        date:     interaction.options.getString('date'),
        time:     interaction.options.getString('time'),
        location: interaction.options.getString('location'),
        info:     interaction.options.getString('info') || '',
      };
      data.concerts.push(concert);
      saveData(data);
      return interaction.reply({ content: `✅ Concert added: **${concert.date}** @ ${concert.time} — ${concert.location}`, ephemeral: true });
    }

    if (sub === 'remove') {
      const now = Date.now();
      const upcoming = data.concerts
        .map((c, i) => ({ ...c, _i: i }))
        .filter(c => { const t = new Date(`${c.date}T${c.time}`).getTime(); return isNaN(t) || t >= now; })
        .sort((a, b) => {
          const ta = new Date(`${a.date}T${a.time}`).getTime();
          const tb = new Date(`${b.date}T${b.time}`).getTime();
          if (isNaN(ta) && isNaN(tb)) return 0;
          if (isNaN(ta)) return 1;
          if (isNaN(tb)) return -1;
          return ta - tb;
        })
        .slice(0, 5);

      const idx = interaction.options.getInteger('index') - 1;
      if (idx < 0 || idx >= upcoming.length) return interaction.reply({ content: '❌ Invalid index.', ephemeral: true });

      const removed = upcoming[idx];
      data.concerts.splice(removed._i, 1);
      saveData(data);
      return interaction.reply({ content: `✅ Removed concert: **${removed.date}** @ ${removed.time} — ${removed.location}`, ephemeral: true });
    }
  }

  if (commandName === 'rolemessage') {
    const ch = interaction.guild.channels.cache.get(REACTION_CHANNEL);
    if (!ch) return interaction.reply({ content: '❌ Reaction channel not found.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎭 Assign your Roles')
      .setDescription('React to this message to assign yourself roles.\nYou can pick one from each category.')
      .addFields(
        { name: '🔤 Pronouns', value: '🇭 He/Him\n🇸 She/Her\n🇹 They/Them\n🇦 Any\n❓ Ask me' },
        { name: '🎂 Age', value: '1️⃣ 13–14\n2️⃣ 15–16\n🔞 18+' },
        { name: '🎸 Instrument', value: '🎤 Singer\n🎸 Guitarist\n🎵 Bassist\n🥁 Drums\n🎹 Pianist' },
      );

    const msg = await ch.send({ embeds: [embed] });

    const emojiRoleMap = {
      '🇭': '1515392950857891870',
      '🇸': '1515393016041312468',
      '🇹': '1515393049549734009',
      '🇦': '1515393152654119127',
      '❓': '1515393187089350686',
      '1️⃣': '1515411509419970601',
      '2️⃣': '1515411437067964456',
      '🔞': '1515411406407864460',
      '🎤': '1515412101517152307',
      '🎸': '1515411998077227188',
      '🎵': '1515412133272354938',
      '🥁': '1515412077458751529',
      '🎹': '1515412047666483310',
    };

    const data = loadData();
    data.reactionRoles[msg.id] = {};
    for (const [emoji, roleId] of Object.entries(emojiRoleMap)) {
      await msg.react(emoji).catch(() => {});
      data.reactionRoles[msg.id][emoji] = roleId;
    }
    saveData(data);

    return interaction.reply({ content: '✅ Role message sent and reactions added.', ephemeral: true });
  }
});

// ── Ticket creation ───────────────────────────────────────────────────────────
async function handleCreateTicket(interaction) {
  const data = loadData();
  const existing = Object.values(data.tickets).find(t => t.userId === interaction.user.id);
  if (existing) {
    return interaction.reply({ content: `❌ You already have an open ticket: <#${existing.channelId}>`, ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const channel = await interaction.guild.channels.create({
    name: `ticket-${interaction.user.username}`,
    type: ChannelType.GuildText,
    parent: TICKET_CATEGORY,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
  });

  data.tickets[channel.id] = { channelId: channel.id, userId: interaction.user.id };
  saveData(data);

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🎫 Ticket Opened')
    .setDescription(`Hello ${interaction.user}! Support will be with you shortly.\n\nUse \`/closeticket\` to close this ticket.`);
  await channel.send({ content: `${interaction.user}`, embeds: [embed] });
  await interaction.editReply({ content: `✅ Ticket created: ${channel}` });
}

// ── Reaction roles ────────────────────────────────────────────────────────────
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.message.channelId !== REACTION_CHANNEL) return;
  if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }

  const data = loadData();
  const map  = data.reactionRoles[reaction.message.id];
  if (!map) return;

  const emoji  = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
  const roleId = map[emoji];
  if (!roleId) return;

  const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (member) await member.roles.add(roleId).catch(() => {});
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.message.channelId !== REACTION_CHANNEL) return;
  if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }

  const data = loadData();
  const map  = data.reactionRoles[reaction.message.id];
  if (!map) return;

  const emoji  = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
  const roleId = map[emoji];
  if (!roleId) return;

  const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (member) await member.roles.remove(roleId).catch(() => {});
});

// ── Logging events ────────────────────────────────────────────────────────────

// Messages
client.on(Events.MessageDelete, async msg => {
  if (msg.partial || msg.author?.bot) return;
  log(msg.guild, logEmbed(0xED4245, '🗑️ Message Deleted', [
    { name: 'Author',   value: `${msg.author.tag} (${msg.author.id})`, inline: true },
    { name: 'Channel',  value: `<#${msg.channel.id}>`,                 inline: true },
    { name: 'Content',  value: msg.content?.slice(0, 1024) || '*empty*' },
  ]));
});

client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
  if (oldMsg.partial || oldMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;
  log(oldMsg.guild, logEmbed(0xFEE75C, '✏️ Message Edited', [
    { name: 'Author',  value: `${oldMsg.author.tag} (${oldMsg.author.id})`, inline: true },
    { name: 'Channel', value: `<#${oldMsg.channel.id}>`,                    inline: true },
    { name: 'Before',  value: oldMsg.content?.slice(0, 512) || '*empty*' },
    { name: 'After',   value: newMsg.content?.slice(0, 512) || '*empty*' },
  ]));
});

// Voice
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const user = newState.member?.user;
  if (!user || user.bot) return;
  const guild = newState.guild;

  if (!oldState.channel && newState.channel) {
    log(guild, logEmbed(0x57F287, '🔊 Joined Voice', [
      { name: 'User',    value: `${user.tag} (${user.id})`, inline: true },
      { name: 'Channel', value: newState.channel.name,       inline: true },
    ]));
  } else if (oldState.channel && !newState.channel) {
    log(guild, logEmbed(0xED4245, '🔇 Left Voice', [
      { name: 'User',    value: `${user.tag} (${user.id})`, inline: true },
      { name: 'Channel', value: oldState.channel.name,       inline: true },
    ]));
  } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
    log(guild, logEmbed(0xFEE75C, '🔀 Switched Voice', [
      { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
      { name: 'From', value: oldState.channel.name,       inline: true },
      { name: 'To',   value: newState.channel.name,       inline: true },
    ]));
  }
});

// Members join/leave
client.on(Events.GuildMemberAdd, member => {
  log(member.guild, logEmbed(0x57F287, '📥 Member Joined', [
    { name: 'User',    value: `${member.user.tag} (${member.user.id})`, inline: true },
    { name: 'Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
  ]));
});

client.on(Events.GuildMemberRemove, member => {
  log(member.guild, logEmbed(0xED4245, '📤 Member Left', [
    { name: 'User', value: `${member.user.tag} (${member.user.id})`, inline: true },
  ]));
});

// Roles assigned/removed
client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
  const added   = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

  if (added.size) {
    log(newMember.guild, logEmbed(0x57F287, '🏷️ Role Added', [
      { name: 'User',  value: `${newMember.user.tag} (${newMember.user.id})`, inline: true },
      { name: 'Roles', value: added.map(r => r.toString()).join(', '),         inline: true },
    ]));
  }
  if (removed.size) {
    log(newMember.guild, logEmbed(0xED4245, '🏷️ Role Removed', [
      { name: 'User',  value: `${newMember.user.tag} (${newMember.user.id})`, inline: true },
      { name: 'Roles', value: removed.map(r => r.toString()).join(', '),       inline: true },
    ]));
  }
});

// Channels
client.on(Events.ChannelCreate, ch => {
  log(ch.guild, logEmbed(0x57F287, '📁 Channel Created', [
    { name: 'Name', value: ch.name,              inline: true },
    { name: 'Type', value: ChannelType[ch.type], inline: true },
  ]));
});

client.on(Events.ChannelDelete, ch => {
  log(ch.guild, logEmbed(0xED4245, '📁 Channel Deleted', [
    { name: 'Name', value: ch.name,              inline: true },
    { name: 'Type', value: ChannelType[ch.type], inline: true },
  ]));
});

client.on(Events.ChannelUpdate, (oldCh, newCh) => {
  if (oldCh.name === newCh.name) return;
  log(newCh.guild, logEmbed(0xFEE75C, '📁 Channel Updated', [
    { name: 'Before', value: oldCh.name, inline: true },
    { name: 'After',  value: newCh.name, inline: true },
  ]));
});

// Audit log: bans
client.on(Events.GuildBanAdd, async ban => {
  log(ban.guild, logEmbed(0xED4245, '🔨 Member Banned', [
    { name: 'User', value: `${ban.user.tag} (${ban.user.id})`, inline: true },
  ]));
});

client.on(Events.GuildBanRemove, async ban => {
  log(ban.guild, logEmbed(0x57F287, '🔓 Member Unbanned', [
    { name: 'User', value: `${ban.user.tag} (${ban.user.id})`, inline: true },
  ]));
});

// Role create/delete/update
client.on(Events.GuildRoleCreate, role => {
  log(role.guild, logEmbed(0x57F287, '🎭 Role Created', [{ name: 'Role', value: role.name }]));
});
client.on(Events.GuildRoleDelete, role => {
  log(role.guild, logEmbed(0xED4245, '🎭 Role Deleted', [{ name: 'Role', value: role.name }]));
});
client.on(Events.GuildRoleUpdate, (oldRole, newRole) => {
  if (oldRole.name === newRole.name) return;
  log(newRole.guild, logEmbed(0xFEE75C, '🎭 Role Renamed', [
    { name: 'Before', value: oldRole.name, inline: true },
    { name: 'After',  value: newRole.name, inline: true },
  ]));
});

// ── Start ─────────────────────────────────────────────────────────────────────
client.login(process.env.BOT_TOKEN);
