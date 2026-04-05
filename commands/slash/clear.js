//slash/clear.js
const { t } = require('../../utils/i18n.js');
const config = require('../../config.json');

module.exports = {
metadata: {
    permission: "ManageGuild",
    name: "clear",
    description: t('commands.clear.metadata_description'),
    args: [
        { type: "user", name: "member", description: t('commands.clear.args_member_desc'), required: true }
    ]
},

async run(client, int, tools) {

    const user = int.options.get("member")?.user

    // 1. Extraer DB y definir idioma
    let db = await tools.fetchSettings(user.id, int.guild.id)
    let serverLang = db?.settings?.lang || config.defaultLanguage || 'en';

    if (!db) return tools.warn("*noData")
    else if (!tools.canManageServer(int.member, db.settings.manualPerms)) return tools.warn("*notMod")
    else if (!db.settings.enabled) return tools.warn("*xpDisabled")

    if (user.bot) return tools.warn(t('commands.clear.noBots', {}, serverLang))

    let current = db.users[user.id]
    let cooldown = current?.cooldown
    if (!cooldown || cooldown <= Date.now()) return tools.warn(t('commands.clear.noCooldown', {}, serverLang))

    client.db.update(int.guild.id, { $set: { [`users.${user.id}.cooldown`]: 0 } }).then(() => {
        int.reply(t('commands.clear.success', { user: tools.pluralS(user.displayName), time: tools.timestamp(cooldown - Date.now()) }, serverLang))
    }).catch(() => tools.warn(t('commands.clear.error', {}, serverLang)))

}}