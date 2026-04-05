const { t } = require('../../utils/i18n.js');
const Discord = require("discord.js")
const config = require('../../config.json');

module.exports = {
metadata: {
    permission: "ManageGuild",
    name: "rewardrole",
    description: t('commands.rewardrole.metadata_description'),
    args: [
        { type: "role", name: "role_name", description: t('commands.rewardrole.args_role_name_desc'), required: true },
        { type: "integer", name: "level", description: t('commands.rewardrole.args_level_desc'), min: 0, max: 1000, required: true },
        { type: "bool", name: "keep", description: t('commands.rewardrole.args_keep_desc') },
        { type: "bool", name: "dont_sync", description: t('commands.rewardrole.args_dont_sync_desc') }
    ]
},

async run(client, int, tools) {

    // 1. Extraer la base de datos y definir el idioma
    let db = await tools.fetchSettings(int.user.id, int.guild.id)
    let serverLang = db?.settings?.lang || config.defaultLanguage || 'en';

    if (!tools.canManageServer(int.member, db.settings.manualPerms)) return tools.warn("*notMod")

    let role = int.options.getRole("role_name")
    let level = tools.clamp(Math.round(int.options.get("level")?.value), 0, 1000)

    let isKeep = !!int.options.get("keep")?.value
    let isDontSync = !!int.options.get("dont_sync")?.value    

    let existingIndex = db.settings.rewards.findIndex(x => x.id == role.id)
    let foundExisting = (existingIndex >= 0) ? db.settings.rewards[existingIndex] : null

    let newRoles = db.settings.rewards
    if (foundExisting) newRoles.splice(existingIndex, 1)

    function finish(msg) {
        let viewRewardRoles = tools.row(tools.button({style: "Primary", label: t('commands.rewardrole.btn_view_all', { count: newRoles.length }, serverLang), customId: "list_reward_roles"}))

        client.db.update(int.guild.id, { $set: { 'settings.rewards': newRoles, 'info.lastUpdate': Date.now() }}).then(() => {
            return int.reply({ content: msg, components: viewRewardRoles })        
        })
    }
    
    if (level == 0) {
        if (!foundExisting) return tools.warn(t('commands.rewardrole.levelZeroError', {}, serverLang))
        return finish(t('commands.rewardrole.deleted', { role: `<@&${role.id}>`, level: foundExisting.level }, serverLang), newRoles)
    }

    if (!int.guild.members.me.permissions.has(Discord.PermissionFlagsBits.ManageRoles)) return tools.warn("*cantManageRoles")

    if (!role.editable) return tools.warn(t('commands.rewardrole.noPerms', { role: `<@&${role.id}>` }, serverLang))

    let roleData = { id: role.id, level }
    let extraStrings = []
    if (isKeep) { roleData.keep = true; extraStrings.push(t('commands.rewardrole.alwaysKept', {}, serverLang)) }
    if (isDontSync) { roleData.noSync = true; extraStrings.push(t('commands.rewardrole.ignoresSync', {}, serverLang)) }

    newRoles.push(roleData)
    let extraStr = (extraStrings.length < 1) ? "" : ` (${extraStrings.join(", ")})`

    if (foundExisting) {
        if (foundExisting.level == level) return tools.warn(t('commands.rewardrole.alreadyGranted', { level: level }, serverLang))
        return finish(t('commands.rewardrole.updated', { role: `<@&${role.id}>`, level: level, oldLevel: foundExisting.level, extraStr: extraStr }, serverLang))
    }

    return finish(t('commands.rewardrole.added', { role: `<@&${role.id}>`, level: level, extraStr: extraStr }, serverLang))

}}