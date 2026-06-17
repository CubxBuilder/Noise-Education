import {
  Client, GatewayIntentBits, Partials, Events, SlashCommandBuilder,
  PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ChannelType, REST, Routes, Collection,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder
} from 'discord.js';
import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';

config();

const DATA_FILE = './data.json';
const defaultData = { tickets: {}, concerts: [], selectRoles: {} };

function loadData() {
  if (!existsSync(DATA_FILE)) saveData(defaultData);
  try { return JSON.parse(readFileSync(DATA_FILE, 'utf8')); }
  catch { return { ...defaultData }; }
}
function saveData(d) { writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

const TICKET_CATEGORY  = '1515398439658323978';
const REACTION_CHANNEL = '1515382046342775034';
const LOG_CHANNEL      = '1515389472034914324';
const INSTAGRAM_URL    = 'https://www.instagram.com/noise.education.band';
const STAFF_PERMS      = PermissionFlagsBits.ManageGuild;

const ROLE_CATEGORIES = [
  {
    id: 'pronouns',
    question: 'What are your pronouns?',
    description: 'Choose the pronouns you identify with.',
    placeholder: 'Select your pronouns',
    options: [
      { label: 'He/Him',   value: '1515392950857891870' },
      { label: 'She/Her',  value: '1515393016041312468' },
      { label: 'They/Them',value: '1515393049549734009' },
      { label: 'Any',      value: '1515393152654119127' },
      { label: 'Ask me',   value: '1515393187089350686' },
    ],
  },
  {
    id: 'age',
    question: 'How old are you?',
    description: 'Choose your age group.',
    placeholder: 'Select your age group',
    options: [
      { label: '13-14', value: '1515411509419970601' },
      { label: '15-16', value: '1515411437067964456' },
      { label: '18+',   value: '1515411406407864460' },
    ],
  },
  {
    id: 'instrument',
    question: 'Do you play an instrument?',
    description: 'Choose your instrument (or none).',
    placeholder: 'Select your instrument',
    options: [
      { label: 'Singer',    value: '1515412101517152307' },
      { label: 'Guitarist', value: '1515411998077227188' },
      { label: 'Bassist',   value: '1515412133272354938' },
      { label: 'Drums',     value: '1515412077458751529' },
      { label: 'Pianist',   value: '1515412047666483310' },
    ],
  },
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

const commands = [
  new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Send the ticket panel')
    .setDefaultMemberPermissions(STAFF_PERMS),

  new SlashCommandBuilder()
    .setName('closeticket')
    .setDescription('Close the current ticket')
    .setDefaultMemberPermissions(STAFF_PERMS),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete messages (default: last message)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('amount').setDescription('Number of messages or "all"').setRequired(false))
    .addUserOption(o => o.setName('user').setDescription('Only from this user').setRequired(false))
    .addStringOption(o => o.setName('before').setDescription('Before this message ID').setRequired(false)),

  new SlashCommandBuilder()
    .setName('instagram')
    .setDescription('Get our Instagram link'),

  new SlashCommandBuilder()
    .setName('concerts')
    .setDescription('Show next 5 upcoming concerts'),

  new SlashCommandBuilder()
    .setName('concert')
    .setDescription('Manage concerts')
    .setDefaultMemberPermissions(STAFF_PERMS)
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a concert')
      .addStringOption(o => o.setName('date').setDescription('Date (e.g. 2025-07-20)').setRequired(true))
      .addStringOption(o => o.setName('time').setDescription('Time (e.g. 20:00)').setRequired(true))
      .addStringOption(o => o.setName('location').setDescription('Location').setRequired(true))
      .addStringOption(o => o.setName('info').setDescription('Additional information').setRequired(false)))
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a concert by index')
      .addIntegerOption(o => o.setName('index').setDescription('Concert number from /concerts').setRequired(true))),

  new SlashCommandBuilder()
    .setName('rolemessage')
    .setDescription('Send the role selection panels into the role channel')
    .setDefaultMemberPermissions(STAFF_PERMS),
  new SlashCommandBuilder()
    .setName('official-links')
    .setDescription('Send the Official Links Panel into the official-links channel')
    .setDefaultMemberPermissions(STAFF_PERMS)
].map(c => c.toJSON());

async function registerCommands(guildId) {
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
}

async function log(guild, embed) {
  const ch = guild.channels.cache.get(LOG_CHANNEL);
  if (ch?.isTextBased()) ch.send({ embeds: [embed] }).catch(() => {});
}

function logEmbed(color, title, fields = []) {
  const e = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();
  if (fields.length) e.addFields(fields);
  return e;
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.guilds.cache.forEach(g => registerCommands(g.id).catch(console.error));
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isButton() && interaction.customId === 'create_ticket') {
    return handleCreateTicket(interaction);
  }

  if (interaction.isStringSelectMenu()) {
    return handleRoleSelect(interaction);
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  if (commandName === 'official-links') {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('Noise Education Official Links')
      .setDescription('<:Instagram:1515445149042475079> [Instagram](https://www.instagram.com/noise.education.band)\n<:Discord:1515445171335204955> [Discord](https://discord.gg/BApen2QEdk)\n<:Reddit:1515641678541754440> [Reddit](https://www.reddit.com/user/noise_education/)\n<:Facebook:1515445520305225908> [Facebook](https://www.facebook.com/profile.php?id=61590938094868&locale=de_DE)\n<:Youtube:1515445533987049512> [Youtube](https://www.youtube.com/@noise_education_band)')
    await interaction.channel.send({ embeds: [embed] });
    await interaction.reply({ content: 'Panel sent.', ephermal: true });
    return;
  }
  if (commandName === 'ticketpanel') {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('Support Tickets')
      .setDescription('Click the button below to open a support ticket.\nOur team will get back to you as soon as possible.');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('create_ticket').setLabel('Open Ticket').setStyle(ButtonStyle.Primary)
    );
    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: 'Panel sent.', ephemeral: true });
    return;
  }

  if (commandName === 'closeticket') {
    const data = loadData();
    if (!data.tickets[interaction.channel.id])
      return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
    await interaction.reply('Closing ticket in 5 seconds...');
    setTimeout(async () => {
      delete data.tickets[interaction.channel.id];
      saveData(data);
      await interaction.channel.delete().catch(() => {});
    }, 5000);
    return;
  }

  if (commandName === 'clear') {
    await interaction.deferReply({ ephemeral: true });
    const amountRaw  = interaction.options.getString('amount');
    const targetUser = interaction.options.getUser('user');
    const beforeId   = interaction.options.getString('before');
    const ch = interaction.channel;

    if (!amountRaw && !targetUser && !beforeId) {
      const msgs = await ch.messages.fetch({ limit: 1 });
      if (msgs.size) await ch.bulkDelete(msgs).catch(() => {});
      return interaction.editReply('Deleted last message.');
    }

    const deleteAll = amountRaw?.toLowerCase() === 'all';
    const limit = deleteAll ? Infinity : Math.min(parseInt(amountRaw) || 100, 100);
    let deleted = 0;
    let lastId = beforeId || null;
    let keepGoing = true;
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;

    while (keepGoing) {
      const opts = { limit: 100 };
      if (lastId) opts.before = lastId;
      const fetched = await ch.messages.fetch(opts).catch(() => new Collection());
      if (!fetched.size) break;

      let toDelete = targetUser ? fetched.filter(m => m.author.id === targetUser.id) : fetched;
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

    return interaction.editReply(`Deleted ${deleted} message(s).`);
  }

  if (commandName === 'instagram') {
    const iconURL = interaction.guild.iconURL({ dynamic: true });
    const embed = new EmbedBuilder()
      .setColor(0xE1306C)
      .setTitle('Noise Education on Instagram')
      .setDescription(`Follow us for updates!\n\n${INSTAGRAM_URL}`);
    if (iconURL) embed.setThumbnail(iconURL);
    return interaction.reply({ embeds: [embed] });
  }

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

    if (!upcoming.length) return interaction.reply({ content: 'No upcoming concerts scheduled.', ephemeral: true });

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

  if (commandName === 'concert') {
    const sub = interaction.options.getSubcommand();
    const data = loadData();
    const now = Date.now();

    if (sub === 'add') {
      const concert = {
        date:     interaction.options.getString('date'),
        time:     interaction.options.getString('time'),
        location: interaction.options.getString('location'),
        info:     interaction.options.getString('info') || '',
      };
      data.concerts.push(concert);
      saveData(data);
      return interaction.reply({ content: `Concert added: ${concert.date} @ ${concert.time} — ${concert.location}`, ephemeral: true });
    }

    if (sub === 'remove') {
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
      if (idx < 0 || idx >= upcoming.length)
        return interaction.reply({ content: 'Invalid index.', ephemeral: true });

      const removed = upcoming[idx];
      data.concerts.splice(removed._i, 1);
      saveData(data);
      return interaction.reply({ content: `Removed: ${removed.date} @ ${removed.time} — ${removed.location}`, ephemeral: true });
    }
  }

  if (commandName === 'rolemessage') {
    const ch = interaction.guild.channels.cache.get(REACTION_CHANNEL);
    if (!ch) return interaction.reply({ content: 'Role channel not found.', ephemeral: true });

    const data = loadData();
    if (!data.selectRoles) data.selectRoles = {};

    for (const cat of ROLE_CATEGORIES) {
      const roleLines = cat.options.map(o => `- <@&${o.value}>`).join('\n');
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(cat.question)
        .setDescription(`${cat.description}\n\n${roleLines}`);

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`role_select_${cat.id}`)
        .setPlaceholder(cat.placeholder)
        .setMinValues(0)
        .setMaxValues(cat.options.length)
        .addOptions(cat.options.map(o =>
          new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value)
        ));

      const msg = await ch.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
      data.selectRoles[msg.id] = { categoryId: cat.id };
    }

    saveData(data);
    return interaction.reply({ content: 'Role panels sent.', ephemeral: true });
  }
});

async function handleCreateTicket(interaction) {
  const data = loadData();
  const existing = Object.values(data.tickets).find(t => t.userId === interaction.user.id);
  if (existing)
    return interaction.reply({ content: `You already have an open ticket: <#${existing.channelId}>`, ephemeral: true });

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
    .setTitle('Ticket Opened')
    .setDescription(`Hello ${interaction.user}! Support will be with you shortly.\n\nUse \`/closeticket\` to close this ticket.`);
  await channel.send({ content: `${interaction.user}`, embeds: [embed] });
  await interaction.editReply({ content: `Ticket created: ${channel}` });
}

async function handleRoleSelect(interaction) {
  if (!interaction.customId.startsWith('role_select_')) return;
  await interaction.deferReply({ ephemeral: true });

  const catId = interaction.customId.replace('role_select_', '');
  const cat = ROLE_CATEGORIES.find(c => c.id === catId);
  if (!cat) return interaction.editReply({ content: 'Unknown category.' });

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return interaction.editReply({ content: 'Could not fetch your member data.' }, console.log("no member data"));
  

  const allRoleIds = cat.options.map(o => o.value);
  console.log(allRoleIds)
  const selected   = interaction.values;

  for (const roleId of allRoleIds) {
    console.log(roleId)
    if (selected.includes(roleId)) {
      await member.roles.add(roleId).catch(err => console.log("error1", roleId, err.message));
    } else {
      await member.roles.remove(roleId).catch(err => console.log("error2", roleId, err.message));
    }
  }

  const names = selected.map(id => cat.options.find(o => o.value === id)?.label).filter(Boolean);
  return interaction.editReply({ content: names.length ? `Roles updated: ${names.join(', ')}` : 'All roles in this category removed.' });
  console.log("role selected")
}

client.on(Events.MessageDelete, async msg => {
  if (msg.partial || msg.author?.bot) return;
  log(msg.guild, logEmbed(0xED4245, 'Message Deleted', [
    { name: 'Author',  value: `${msg.author.tag} (${msg.author.id})`, inline: true },
    { name: 'Channel', value: `<#${msg.channel.id}>`,                 inline: true },
    { name: 'Content', value: msg.content?.slice(0, 1024) || '*empty*' },
  ]));
});

client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
  if (oldMsg.partial || oldMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;
  log(oldMsg.guild, logEmbed(0xFEE75C, 'Message Edited', [
    { name: 'Author',  value: `${oldMsg.author.tag} (${oldMsg.author.id})`, inline: true },
    { name: 'Channel', value: `<#${oldMsg.channel.id}>`,                    inline: true },
    { name: 'Before',  value: oldMsg.content?.slice(0, 512) || '*empty*' },
    { name: 'After',   value: newMsg.content?.slice(0, 512) || '*empty*' },
  ]));
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const user = newState.member?.user;
  if (!user || user.bot) return;
  const guild = newState.guild;
  if (!oldState.channel && newState.channel) {
    log(guild, logEmbed(0x57F287, 'Joined Voice', [
      { name: 'User',    value: `${user.tag} (${user.id})`, inline: true },
      { name: 'Channel', value: newState.channel.name,       inline: true },
    ]));
  } else if (oldState.channel && !newState.channel) {
    log(guild, logEmbed(0xED4245, 'Left Voice', [
      { name: 'User',    value: `${user.tag} (${user.id})`, inline: true },
      { name: 'Channel', value: oldState.channel.name,       inline: true },
    ]));
  } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
    log(guild, logEmbed(0xFEE75C, 'Switched Voice', [
      { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
      { name: 'From', value: oldState.channel.name,       inline: true },
      { name: 'To',   value: newState.channel.name,       inline: true },
    ]));
  }
});

client.on(Events.GuildMemberAdd, member => {
  log(member.guild, logEmbed(0x57F287, 'Member Joined', [
    { name: 'User',    value: `${member.user.tag} (${member.user.id})`, inline: true },
    { name: 'Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
  ]));
});

client.on(Events.GuildMemberRemove, member => {
  log(member.guild, logEmbed(0xED4245, 'Member Left', [
    { name: 'User', value: `${member.user.tag} (${member.user.id})`, inline: true },
  ]));
});

client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
  const added   = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
  if (added.size) {
    log(newMember.guild, logEmbed(0x57F287, 'Role Added', [
      { name: 'User',  value: `${newMember.user.tag} (${newMember.user.id})`, inline: true },
      { name: 'Roles', value: added.map(r => r.toString()).join(', '),         inline: true },
    ]));
  }
  if (removed.size) {
    log(newMember.guild, logEmbed(0xED4245, 'Role Removed', [
      { name: 'User',  value: `${newMember.user.tag} (${newMember.user.id})`, inline: true },
      { name: 'Roles', value: removed.map(r => r.toString()).join(', '),       inline: true },
    ]));
  }
});

client.on(Events.ChannelCreate, ch => {
  log(ch.guild, logEmbed(0x57F287, 'Channel Created', [
    { name: 'Name', value: ch.name,              inline: true },
    { name: 'Type', value: ChannelType[ch.type], inline: true },
  ]));
});

client.on(Events.ChannelDelete, ch => {
  log(ch.guild, logEmbed(0xED4245, 'Channel Deleted', [
    { name: 'Name', value: ch.name,              inline: true },
    { name: 'Type', value: ChannelType[ch.type], inline: true },
  ]));
});

client.on(Events.ChannelUpdate, (oldCh, newCh) => {
  if (oldCh.name === newCh.name) return;
  log(newCh.guild, logEmbed(0xFEE75C, 'Channel Updated', [
    { name: 'Before', value: oldCh.name, inline: true },
    { name: 'After',  value: newCh.name, inline: true },
  ]));
});

client.on(Events.GuildBanAdd, ban => {
  log(ban.guild, logEmbed(0xED4245, 'Member Banned', [
    { name: 'User', value: `${ban.user.tag} (${ban.user.id})`, inline: true },
  ]));
});

client.on(Events.GuildBanRemove, ban => {
  log(ban.guild, logEmbed(0x57F287, 'Member Unbanned', [
    { name: 'User', value: `${ban.user.tag} (${ban.user.id})`, inline: true },
  ]));
});

client.on(Events.GuildRoleCreate, role => {
  log(role.guild, logEmbed(0x57F287, 'Role Created', [{ name: 'Role', value: role.name }]));
});

client.on(Events.GuildRoleDelete, role => {
  log(role.guild, logEmbed(0xED4245, 'Role Deleted', [{ name: 'Role', value: role.name }]));
});

client.on(Events.GuildRoleUpdate, (oldRole, newRole) => {
  if (oldRole.name === newRole.name) return;
  log(newRole.guild, logEmbed(0xFEE75C, 'Role Renamed', [
    { name: 'Before', value: oldRole.name, inline: true },
    { name: 'After',  value: newRole.name, inline: true },
  ]));
});

client.login(process.env.BOT_TOKEN);
