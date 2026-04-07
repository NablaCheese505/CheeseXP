const Discord = require('discord.js');
const { t } = require('../../utils/i18n.js');
const config = require("../../config.json");

module.exports = {
metadata: {
    name: "button:toggle_voice",
},

async run(client, int, tools) {
    let db = await tools.fetchSettings(int.user.id, int.guild.id);
    let serverLang = db?.settings?.lang || config.defaultLanguage || 'en';
    if (!db) return tools.warn("*noData");

    let settings = db.settings;
    if (!tools.canManageServer(int.member, settings.manualPerms)) return tools.warn("*notMod");

    let actionIsEnable = int.component.style == Discord.ButtonStyle.Success;

    if (actionIsEnable == settings.enabledVoiceXp) return int.reply({content: t('commands.toggle_xp.voiceAlready', { state: actionIsEnable ? t('commands.toggle_xp.enabled', {}, serverLang) : t('commands.toggle_xp.disabled', {}, serverLang) }, serverLang), ephemeral: true});
    
    client.db.update(int.guild.id, { $set: { 'settings.enabledVoiceXp': actionIsEnable, 'info.lastUpdate': Date.now() }}).then(() => {
        int.reply(t('commands.toggle_xp.voiceSuccess', { state: actionIsEnable ? t('commands.toggle_xp.enabled', {}, serverLang) : t('commands.toggle_xp.disabled', {}, serverLang) }, serverLang));
    }).catch(() => tools.warn(t('commands.toggle_xp.error', {}, serverLang)));
}}