//slash/multiplier.js
const { t } = require('../../utils/i18n.js');
const config = require('../../config.json');

module.exports = {
metadata: {
    permission: "ManageGuild",
    name: "multiplier",
    description: t('commands.multiplier.metadata_description'),
    args: [
        { type: "subcommand", name: "role", description: t('commands.multiplier.args_role_desc'), args: [
            { type: "role", name: "role_name", description: t('commands.multiplier.args_role_name_desc'), required: true },
            { type: "float", name: "multiplier", description: t('commands.multiplier.args_mult_desc'), min: 0, max: 100, required: true },
            { type: "bool", name: "remove", description: t('commands.multiplier.args_remove_desc') }
        ]},

        { type: "subcommand", name: "channel", description: t('commands.multiplier.args_channel_desc'), args: [
            { type: "channel", name: "channel_name", description: t('commands.multiplier.args_channel_name_desc'), required: true, acceptAll: true },
            { type: "float", name: "multiplier", description: t('commands.multiplier.args_mult_desc'), min: 0, max: 100, required: true },
            { type: "bool", name: "remove", description: t('commands.multiplier.args_remove_desc') }
        ]}
    ]
},

async run(client, int, tools) {

    let db = await tools.fetchSettings(int.user.id, int.guild.id)
    let serverLang = db?.settings?.lang || config.defaultLanguage || 'en';

    if (!tools.canManageServer(int.member, db.settings.manualPerms)) return tools.warn("*notMod")

    let type = int.options.getSubcommand(false)
    let typeTranslated = type === 'role' ? t('commands.multiplier.type_role', {}, serverLang) : t('commands.multiplier.type_channel', {}, serverLang);

    let boostVal = int.options.get("multiplier")?.value ?? 1
    
    let role = int.options.getRole("role_name")
    let channel = int.options.getChannel("channel_name")
    let boost = tools.clamp(+boostVal.toFixed(2), 0, 100)
    let remove = !!int.options.get("remove")?.value
    
    if (!channel && !role) return
    let target = (channel || role)
    let tag = role ? `<@&${role.id}>` : `<#${channel.id}>`

    let typeIndex = role ? "roles" : "channels"
    let mults = db.settings.multipliers[typeIndex]
    let existingIndex = mults.findIndex(x => x.id == target.id)
    let foundExisting = (existingIndex >= 0) ? mults[existingIndex] : null

    let newList = db.settings.multipliers
    if (foundExisting) db.settings.multipliers[typeIndex].splice(existingIndex, 1)

    function finish(msg) {
        let viewMultipliers = tools.row([
            tools.button({style: role ? "Primary" : "Secondary", label: t('commands.multiplier.btn_role_mult', { count: newList.roles.length }, serverLang), customId: "list_multipliers~roles"}),
            tools.button({style: role ? "Secondary" : "Primary", label: t('commands.multiplier.btn_channel_mult', { count: newList.channels.length }, serverLang), customId: "list_multipliers~channels"})
        ])

        client.db.update(int.guild.id, { $set: { [`settings.multipliers.${typeIndex}`]: newList[typeIndex], 'info.lastUpdate': Date.now() }}).then(() => {
            return int.reply({ content: msg, components: viewMultipliers })        
        })
    }

    if (remove) {
        if (!foundExisting) return tools.warn(t('commands.multiplier.neverHad', { type: typeTranslated }, serverLang))
        return finish(t('commands.multiplier.deleted', { boost: foundExisting.boost, tag: tag }, serverLang))
    }

    let boostData = { id: target.id, boost }
    newList[typeIndex].push(boostData)
    let boostStr = boost == 0 ? t('commands.multiplier.noXP', {}, serverLang) : t('commands.multiplier.xpBoost', { boost: boost }, serverLang)

    if (foundExisting) {
        if (foundExisting.boost == boost) return tools.warn(t('commands.multiplier.alreadyGives', { type: typeTranslated, boost: boost }, serverLang))
        return finish(t('commands.multiplier.updated', { tag: tag, boostStr: boostStr, oldBoost: foundExisting.boost }, serverLang))
    }
    
    return finish(t('commands.multiplier.added', { tag: tag, boostStr: boostStr }, serverLang))

}}