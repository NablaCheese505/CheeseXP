//slash/config.js
const { t } = require('../../utils/i18n.js');
const config = require('../../config.json');
const botConfig = require('../../config.json');

module.exports = {
metadata: {
    permission: "ManageGuild",
    name: "config",
    description: t('commands.config.metadata_description'),
},

async run(client, int, tools) {

    let db = await tools.fetchSettings(int.user.id, int.guild.id)
    let serverLang = db?.settings?.lang || config.defaultLanguage || 'en';
    let settings = db.settings

    if (!tools.canManageServer(int.member, db.settings.manualPerms)) return tools.warn("*notMod")

    let polarisSettings = [
        t('commands.config.xpEnabled', { status: settings.enabled ? t('commands.config.yes', {}, serverLang) : t('commands.config.no', {}, serverLang) }, serverLang),
        
        t('commands.config.voiceEnabled', { status: settings.enabledVoiceXp ? t('commands.config.yes', {}, serverLang) : t('commands.config.no', {}, serverLang) }, serverLang),
        t('commands.config.voiceMultiplier', { mult: settings.voice.multiplier }, serverLang),
        t('commands.config.voiceLimit', { limit: settings.voice.hoursLimit > 0 ? `${settings.voice.hoursLimit}h` : t('commands.config.noLimit', {}, serverLang) }, serverLang),

        t('commands.config.xpPerMsg', { range: settings.gain.min == settings.gain.max ? tools.commafy(settings.gain.min) : `${tools.commafy(settings.gain.min)} - ${tools.commafy(settings.gain.max)}` }, serverLang),
        t('commands.config.xpCooldown', { time: tools.commafy(settings.gain.time), sec: tools.extraS("sec", settings.gain.time) }, serverLang),
        t('commands.config.xpCurve', { curve: `${settings.curve[3]}x³ + ${settings.curve[2]}x² + ${settings.curve[1]}x` }, serverLang),
        t('commands.config.lvlMsg', { status: settings.levelUp.enabled && settings.levelUp.message ? (settings.levelUp.embed ? t('commands.config.enabledEmbed', {}, serverLang) : t('commands.config.enabled', {}, serverLang)) : t('commands.config.disabled', {}, serverLang) }, serverLang),
        t('commands.config.rankCards', { status: settings.rankCard.disabled ? t('commands.config.disabled', {}, serverLang) : settings.rankCard.ephemeral ? t('commands.config.enabledHidden', {}, serverLang) : t('commands.config.enabled', {}, serverLang) }, serverLang),
        t('commands.config.leaderboard', { status: settings.leaderboard.disabled ? t('commands.config.disabled', {}, serverLang) : `[${settings.leaderboard.private ? t('commands.config.private', {}, serverLang) : t('commands.config.public', {}, serverLang)}](<${tools.WEBSITE}/leaderboard/${int.guild.id}>)` }, serverLang)
    ]

    let embed = tools.createEmbed({
        author: { name: t('commands.config.embedAuthor', { guild: int.guild.name }, serverLang), iconURL: int.guild.iconURL() },
        footer: t('commands.config.embedFooter', {}, serverLang),
        color: tools.COLOR, timestamp: true,
        description: polarisSettings.join("\n")
    })

    let toggleBtn = settings.enabled ?
      {style: "Danger", label: t('commands.config.btnDisableXP', {}, serverLang), emoji: botConfig.emojis.disable, customId: "toggle_xp" }
    : {style: "Success", label: t('commands.config.btnEnableXP', {}, serverLang), emoji: botConfig.emojis.xp, customId: "toggle_xp" };

    let toggleVoiceBtn = settings.enabledVoiceXp ?
      {style: "Danger", label: t('commands.config.btnDisableVoice', {}, serverLang), emoji: botConfig.emojis.disable, customId: "toggle_voice" }
    : {style: "Success", label: t('commands.config.btnEnableVoice', {}, serverLang), emoji: botConfig.emojis.mic || "🎤", customId: "toggle_voice" };

    let buttonsRow1 = tools.button([
        {style: "Success", label: t('commands.config.btnEditSettings', {}, serverLang), emoji: botConfig.emojis.settings, customId: "settings_list"},
        toggleBtn,
        toggleVoiceBtn
    ]);
    
    let buttonsRow2 = tools.button([
        {style: "Link", label: t('commands.config.btnEditOnline', {}, serverLang), emoji: botConfig.emojis.online, url: `${tools.WEBSITE}/settings/${int.guild.id}`},
        {style: "Secondary", label: t('commands.config.btnExport', {}, serverLang), emoji: botConfig.emojis.export, customId: "export_xp"}
    ]);

    let listButtons = tools.button([
        {style: "Primary", label: t('commands.config.btnRewardRoles', { count: settings.rewards.length }, serverLang), customId: "list_reward_roles"},
        {style: "Primary", label: t('commands.config.btnRoleMulti', { count: settings.multipliers.roles.length }, serverLang), customId: "list_multipliers~roles"},
        {style: "Primary", label: t('commands.config.btnChannelMulti', { count: settings.multipliers.channels.length }, serverLang), customId: "list_multipliers~channels"}
    ])

    return int.reply({embeds: [embed], components: [tools.row(buttonsRow1)[0], tools.row(buttonsRow2)[0], tools.row(listButtons)[0]]})

}}