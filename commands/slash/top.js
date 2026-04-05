const { t } = require('../../utils/i18n.js');
const config = require('../../config.json');
const PageEmbed = require("../../classes/PageEmbed.js")

module.exports = {
metadata: {
    name: "top",
    description: t('commands.top.metadata_description'),
    args: [
        { type: "integer", name: "page", description: t('commands.top.args_page_desc'), required: false },
        { type: "user", name: "member", description: t('commands.top.args_member_desc'), required: false },
        { type: "bool", name: "hidden", description: t('commands.top.args_hidden_desc'), required: false }
    ]
},

async run(client, int, tools) {

    let db = await tools.fetchAll(int.guild.id) 
    let serverLang = db?.settings?.lang || config.defaultLanguage || 'es';

    let lbLink = `${tools.WEBSITE}/leaderboard/${int.guild.id}`

    if (!db || !db.users || !Object.keys(db.users).length) return tools.warn(t('commands.top.nobodyRanked', {}, serverLang));
    else if (!db.settings.enabled) return tools.warn("*xpDisabled")
    else if (db.settings.leaderboard.disabled) return tools.warn(t('commands.top.disabled', {}, serverLang) + (tools.canManageServer(int.member) ? t('commands.top.modView', { link: lbLink }, serverLang) : ""))

    let pageNumber = int.options.get("page")?.value || 1
    let pageSize = 10

    let minLeaderboardXP = db.settings.leaderboard.minLevel > 1 ? tools.xpForLevel(db.settings.leaderboard.minLevel, db.settings) : 0
    let rankings = tools.xpObjToArray(db.users)
    rankings = rankings.filter(x => x.xp > minLeaderboardXP && !x.hidden).sort(function(a, b) {return b.xp - a.xp})

    if (db.settings.leaderboard.maxEntries > 0) rankings = rankings.slice(0, db.settings.leaderboard.maxEntries)

    if (!rankings.length) return tools.warn(t('commands.top.nobodyOnLB', {}, serverLang))

    let highlight = null
    let userSearch = int.options.get("user") || int.options.get("member") 
    if (userSearch) {
        let foundRanking = rankings.findIndex(x => x.id == userSearch.user.id)
        if (isNaN(foundRanking) || foundRanking < 0) return tools.warn(int.user.id == userSearch.user.id ? t('commands.top.youNotOnLB', {}, serverLang) : t('commands.top.memberNotOnLB', {}, serverLang))
        else pageNumber = Math.floor(foundRanking / pageSize) + 1
        highlight = userSearch.user.id
    }

    let listCol = db.settings.leaderboard.embedColor
    if (listCol == -1) listCol = null

    let embed = tools.createEmbed({
        color: listCol || tools.COLOR,
        author: {name: t('commands.top.embedTitle', { guild: int.guild.name }, serverLang), iconURL: int.guild.iconURL()}
    })

    let isHidden = db.settings.leaderboard.ephemeral || !!int.options.get("hidden")?.value

    let xpEmbed = new PageEmbed(embed, rankings, {
        page: pageNumber, size: pageSize, owner: int.user.id,  ephemeral: isHidden,
        mapFunction: (x, y, p) => t('commands.top.listItem', { p: p, highlight1: x.id == highlight ? "**" : "", level: tools.getLevel(x.xp, db.settings), id: x.id, xp: tools.commafy(x.xp), highlight2: x.id == highlight ? "**" : "" }, serverLang),
        extraButtons: [ tools.button({style: "Link", label: t('commands.top.btnOnline', {}, serverLang), url: lbLink}) ]
    })
    if (!xpEmbed.data.length) return tools.warn(t('commands.top.noMembersPage', {}, serverLang))

    xpEmbed.post(int)

}}