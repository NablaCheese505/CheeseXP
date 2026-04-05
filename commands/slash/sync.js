const { t } = require('../../utils/i18n.js');
const config = require('../../config.json');
const Discord = require('discord.js')

module.exports = {
metadata: {
    name: "sync",
    description: t('commands.sync.metadata_description'),
    args: [
        { type: "user", name: "member", description: t('commands.sync.args_member_desc'), required: false }
    ]
},

async run(client, int, tools) {

    let foundUser = int.options.get("member")
    let member = foundUser ? foundUser.member : int.member

    let db = await tools.fetchSettings(member.id, int.guild.id)
    let serverLang = db?.settings?.lang || config.defaultLanguage || 'en';

    if (!int.guild.members.me.permissions.has(Discord.PermissionFlagsBits.ManageRoles)) return tools.warn("*cantManageRoles")

    if (!db) return tools.warn("*noData")
    else if (!db.settings.enabled) return tools.warn("*xpDisabled")

    let isMod = db.settings.manualPerms ? tools.canManageRoles(int.member) : tools.canManageServer(int.member)
    if (member.id != int.user.id && !isMod) return tools.warn(t('commands.sync.noPermOther', {}, serverLang))

    else if (db.settings.noManual && !isMod) return tools.warn(t('commands.sync.noPermSelf', {}, serverLang))
    else if (!db.settings.rewards.length) return tools.warn(t('commands.sync.noRoles', {}, serverLang))

    let currentXP = db.users[member.id]
    if (!currentXP || !currentXP.xp) return tools.noXPYet(member.user)

    let xp = currentXP.xp
    let level = tools.getLevel(xp, db.settings)

    let currentRoles = member.roles.cache
    let roleCheck = tools.checkLevelRoles(int.guild.roles.cache, currentRoles, level, db.settings.rewards)
    if (!roleCheck.incorrect.length && !roleCheck.missing.length) return int.reply(t('commands.sync.alreadySynced', {}, serverLang))

    tools.syncLevelRoles(member, roleCheck).then(() => {
        let replyStr = [t('commands.sync.success', {}, serverLang)]
        if (roleCheck.missing.length) replyStr.push(t('commands.sync.added', { roles: roleCheck.missing.map(x => `<@&${x.id}>`).join(" ") }, serverLang))
        if (roleCheck.incorrect.length) replyStr.push(t('commands.sync.removed', { roles: roleCheck.incorrect.map(x => `<@&${x.id}>`).join(" ") }, serverLang))
        return int.reply(replyStr.join("\n"))
    }).catch(e => int.reply(t('commands.sync.error', { error: e.message }, serverLang)))

}}