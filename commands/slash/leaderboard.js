const { t } = require('../../utils/i18n.js');
const config = require('../../config.json');
const PageEmbed = require("../../classes/PageEmbed.js")
const LeaderboardCard = require('../../classes/LeaderboardCard.js');

module.exports = {
metadata: {
    name: "leaderboard",
    description: t('commands.top.metadata_description'),
    args: [
        { type: "integer", name: "page", description: t('commands.top.args_page_desc'), required: false },
        { type: "user", name: "member", description: t('commands.top.args_member_desc'), required: false },
        { type: "bool", name: "hidden", description: t('commands.top.args_hidden_desc'), required: false }
    ]
},

async run(client, int, tools) {

    let db = await tools.fetchAll(int.guild.id) 
    let serverLang = db?.settings?.lang || config.defaultLanguage || 'en';

    let lbLink = `${tools.WEBSITE}/leaderboard/${int.guild.id}`

    if (!db || !db.users || !Object.keys(db.users).length) return tools.warn(t('commands.top.nobodyRanked', {}, serverLang));
    else if (!db.settings.enabled) return tools.warn("*xpDisabled")
    else if (db.settings.leaderboard.disabled) return tools.warn(t('commands.top.disabled', {}, serverLang) + (tools.canManageServer(int.member) ? t('commands.top.modView', { link: lbLink }, serverLang) : ""))

    let pageNumber = int.options.get("page")?.value || 1
    let pageSize = 10

    let minLeaderboardXP = db.settings.leaderboard.minLevel > 1 ? tools.xpForLevel(db.settings.leaderboard.minLevel, db.settings) : 0
    let rankings = tools.xpObjToArray(db.users)
    rankings = rankings.filter(x => x.xp > minLeaderboardXP && !x.hidden).sort((a, b) => b.xp - a.xp);
    if (!rankings.length) return tools.warn(t('commands.top.nobodyOnLB', {}, serverLang));

    let highlight = null;
    let userSearch = int.options.get("user") || int.options.get("member");
    
    pageSize = 5; 

    if (userSearch) {
        let foundRanking = rankings.findIndex(x => x.id == userSearch.user.id);
        if (isNaN(foundRanking) || foundRanking < 0) return tools.warn(int.user.id == userSearch.user.id ? t('commands.top.youNotOnLB', {}, serverLang) : t('commands.top.memberNotOnLB', {}, serverLang));
        else pageNumber = Math.floor(foundRanking / pageSize) + 1;
        highlight = userSearch.user.id;
    }

    let isHidden = db.settings.leaderboard.ephemeral || !!int.options.get("hidden")?.value;
    await int.deferReply({ ephemeral: isHidden });

    const totalPages = Math.ceil(rankings.length / pageSize);
    if (pageNumber > totalPages) pageNumber = totalPages;
    if (pageNumber < 1) pageNumber = 1;

    const startIndex = (pageNumber - 1) * pageSize;
    const pageRankings = rankings.slice(startIndex, startIndex + pageSize);

    const enrichedRankings = await Promise.all(pageRankings.map(async (x, index) => {
        let userObj = client.users.cache.get(x.id) || await client.users.fetch(x.id).catch(() => null);
        let avatarURL = userObj ? userObj.displayAvatarURL({ extension: 'png', size: 128 }) : 'https://cdn.discordapp.com/embed/avatars/0.png';
        
        return {
            id: x.id,
            rank: startIndex + index + 1,
            xp: x.xp,
            xpFormatted: tools.commafy(x.xp),
            level: tools.getLevel(x.xp, db.settings),
            displayName: userObj ? (userObj.globalName || userObj.username) : "Unknown User",
            username: userObj ? userObj.username : "Unknown",
            avatarURL: avatarURL
        };
    }));

    try {
        const lbGenerator = new LeaderboardCard(enrichedRankings, db.settings, { page: pageNumber, totalPages });
        const imageBuffer = await lbGenerator.build();

        let actionRow = tools.row([tools.button({style: "Link", label: t('commands.top.btnOnline', {}, serverLang), url: lbLink})]);

        return int.editReply({ files: [{ attachment: imageBuffer, name: 'leaderboard.png' }], components: actionRow });
    } catch (error) {
        console.error("Error generando Leaderboard de Imagen:", error);
        return int.editReply({ content: "Hubo un error al generar la imagen de la tabla de clasificación." });
    }
}}