const { t } = require('../../utils/i18n.js');
const config = require('../../config.json');

module.exports = {
metadata: {
    permission: "ManageGuild",
    name: "addxp",
    description: t('commands.addxp.metadata_description'),
    args: [
        { 
            type: "user", 
            name: "member", 
            description: t('commands.addxp.args_member_desc'), 
            required: true 
        },
        { 
            type: "integer", 
            name: "xp", 
            description: t('commands.addxp.args_xp_desc'), 
            min: -1e10, max: 1e10, required: true 
        },
        { 
            type: "string", 
            name: "operation", 
            description: t('commands.addxp.args_operation_desc'), 
            required: false, 
            choices: [
                { name: t('commands.addxp.choice_add_xp'), value: "add_xp" },
                { name: t('commands.addxp.choice_set_xp'), value: "set_xp" },
                { name: t('commands.addxp.choice_add_levels'), value: "add_level" },
                { name: t('commands.addxp.choice_set_level'), value: "set_level" },
            ]
        },
    ]
},

async run(client, int, tools) {
    let db = await tools.fetchSettings(int.user.id, int.guild.id)
    
    let serverLang = db?.settings?.lang || config.defaultLanguage || 'en';

    const member = int.options.get("member")?.member
    const amount = int.options.get("xp")?.value
    const operation = int.options.get("operation")?.value || "add_xp"

    let user = member?.user
    
    if (!user) return tools.warn(t('commands.addxp.memberNotFound', {}, serverLang))

    if (!db) return tools.warn("*noData")
    else if (!tools.canManageServer(int.member, db.settings.manualPerms)) return tools.warn("*notMod")
    else if (!db.settings.enabled) return tools.warn("*xpDisabled")

    // Inyección de i18n
    if (amount === 0 && operation.startsWith("add")) return tools.warn(t('commands.addxp.invalidAmount', {}, serverLang))
    else if (user.bot) return tools.warn(t('commands.addxp.noBots', {}, serverLang))

    let currentXP = db.users[user.id]
    let xp = currentXP?.xp || 0
    let level = tools.getLevel(xp, db.settings)

    let newXP = xp
    let newLevel = level

    switch (operation) {
        case "add_xp": newXP += amount; break;
        case "set_xp": newXP = amount; break;
        case "add_level": newLevel += amount; break;
        case "set_level": newLevel = amount; break;
    }

    newXP = Math.max(0, newXP) // min 0
    newLevel = tools.clamp(newLevel, 0, db.settings.maxLevel) // between 0 and max level

    if (newXP != xp) newLevel = tools.getLevel(newXP, db.settings)
    else if (newLevel != level) newXP = tools.xpForLevel(newLevel, db.settings)

    let syncMode = db.settings.rewardSyncing.sync
    if (syncMode == "xp" || (syncMode == "level" && newLevel != level) || (newLevel > level)) { 
        let roleCheck = tools.checkLevelRoles(int.guild.roles.cache, member.roles.cache, newLevel, db.settings.rewards)
        tools.syncLevelRoles(member, roleCheck).catch(() => {})
    }
    let xpDiff = newXP - xp

    client.db.update(int.guild.id, { $set: { [`users.${user.id}.xp`]: newXP } }).then(() => {
        
        const emoji = newXP > xp ? "⏫" : "⏬";
        const levelText = newLevel != level ? t('commands.addxp.levelText', { newLevel }, serverLang) : "";
        const formattedDiff = `${xpDiff >= 0 ? "+" : ""}${tools.commafy(xpDiff)}`;
        
        const replyMessage = t('commands.addxp.success', {
            emoji: emoji,
            user: user.displayName,
            newXP: tools.commafy(newXP),
            levelText: levelText,
            oldXP: tools.commafy(xp),
            xpDiff: formattedDiff
        }, serverLang);

        int.reply(replyMessage);

    }).catch(() => tools.warn(t('commands.addxp.error', {}, serverLang)))

}}