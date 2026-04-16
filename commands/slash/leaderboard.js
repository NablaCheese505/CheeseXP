const { t } = require('../../utils/i18n.js');
const config = require('../../config.json');
const LeaderboardCard = require('../../classes/LeaderboardCard.js');
const Discord = require('discord.js');

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

    let db = await tools.fetchAll(int.guild.id);
    let serverLang = db?.settings?.lang || config.defaultLanguage || 'en';
    let lbLink = `${tools.WEBSITE}/leaderboard/${int.guild.id}`;

    if (!db || !db.users || !Object.keys(db.users).length) return tools.warn(t('commands.top.nobodyRanked', {}, serverLang));
    else if (!db.settings.enabled) return tools.warn("*xpDisabled");
    else if (db.settings.leaderboard.disabled) return tools.warn(t('commands.top.disabled', {}, serverLang) + (tools.canManageServer(int.member) ? t('commands.top.modView', { link: lbLink }, serverLang) : ""));

    let pageSize = 5; 
    let pageNumber = int.options.get("page")?.value || 1;

    let minLeaderboardXP = db.settings.leaderboard.minLevel > 1 ? tools.xpForLevel(db.settings.leaderboard.minLevel, db.settings) : 0;
    
    let rankings = tools.xpObjToArray(db.users);
    rankings = rankings.filter(x => x.xp > minLeaderboardXP && !x.hidden).sort((a, b) => b.xp - a.xp);

    if (!rankings.length) return tools.warn(t('commands.top.nobodyOnLB', {}, serverLang));

    let highlight = null;
    let userSearch = int.options.get("user") || int.options.get("member");

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

    const getComponents = (currentPage) => {
        let prevBtn = new Discord.ButtonBuilder()
            .setCustomId('lb_prev')
            .setLabel(t('commands.top.btnPrev', {}, serverLang))
            .setStyle(Discord.ButtonStyle.Primary)
            .setDisabled(currentPage <= 1);

        let nextBtn = new Discord.ButtonBuilder()
            .setCustomId('lb_next')
            .setLabel(t('commands.top.btnNext', {}, serverLang))
            .setStyle(Discord.ButtonStyle.Primary)
            .setDisabled(currentPage >= totalPages);

        let linkBtn = new Discord.ButtonBuilder()
            .setLabel(t('commands.top.btnOnline', {}, serverLang))
            .setURL(lbLink)
            .setStyle(Discord.ButtonStyle.Link);

        return new Discord.ActionRowBuilder().addComponents(prevBtn, nextBtn, linkBtn);
    };

    const generateImageForPage = async (page) => {
        const startIndex = (page - 1) * pageSize;
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
                displayName: userObj ? (userObj.globalName || userObj.username) : "Usuario Desconocido",
                username: userObj ? userObj.username : "Unknown",
                avatarURL: avatarURL
            };
        }));

        const lbGenerator = new LeaderboardCard(enrichedRankings, db.settings, { page: page, totalPages });
        return await lbGenerator.build();
    };
const preloadCache = new Map();

    const triggerPreload = (currentPage) => {
        for (let key of preloadCache.keys()) {
            if (key !== currentPage && key !== currentPage - 1 && key !== currentPage + 1) {
                preloadCache.delete(key);
            }
        }
        
        if (currentPage < totalPages && !preloadCache.has(currentPage + 1)) {
            generateImageForPage(currentPage + 1)
                .then(buffer => preloadCache.set(currentPage + 1, buffer))
                .catch(() => {});
        }

        if (currentPage > 1 && !preloadCache.has(currentPage - 1)) {
            generateImageForPage(currentPage - 1)
                .then(buffer => preloadCache.set(currentPage - 1, buffer))
                .catch(() => {});
        }
    };

    try {
        let imageBuffer = await generateImageForPage(pageNumber);
        preloadCache.set(pageNumber, imageBuffer);

        let message = await int.editReply({ 
            files: [{ attachment: imageBuffer, name: 'leaderboard.png' }], 
            components: [getComponents(pageNumber)] 
        });

        triggerPreload(pageNumber);

        const collector = message.createMessageComponentCollector({ time: 120000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== int.user.id) {
                return i.reply({ content: t('commands.top.onlyUser', {}, serverLang), ephemeral: true });
            }

            let targetPage = pageNumber;
            if (i.customId === 'lb_prev' && pageNumber > 1) targetPage--;
            if (i.customId === 'lb_next' && pageNumber < totalPages) targetPage++;

            if (targetPage === pageNumber) return i.deferUpdate();

            let newImageBuffer;

            if (preloadCache.has(targetPage)) {
                newImageBuffer = preloadCache.get(targetPage);
                await i.update({ 
                    content: "", 
                    files: [{ attachment: newImageBuffer, name: 'leaderboard.png' }], 
                    components: [getComponents(targetPage)] 
                });
            } else {
                let loadingRow = getComponents(targetPage);
                loadingRow.components.forEach(c => c.setDisabled(true)); 

                await i.update({ 
                    content: t('commands.top.loadingImage', { target: targetPage, total: totalPages }, serverLang),
                    components: [loadingRow] 
                });

                newImageBuffer = await generateImageForPage(targetPage);
                preloadCache.set(targetPage, newImageBuffer); 
                await int.editReply({ 
                    content: "", 
                    files: [{ attachment: newImageBuffer, name: 'leaderboard.png' }], 
                    components: [getComponents(targetPage)] 
                });
            }

            pageNumber = targetPage;
            
            triggerPreload(pageNumber);
        });

        collector.on('end', async () => {
            preloadCache.clear();
            let disabledRow = getComponents(pageNumber);
            disabledRow.components.forEach(c => {
                if (c.data.custom_id !== undefined) c.setDisabled(true);
            });
            await int.editReply({ components: [disabledRow] }).catch(() => {});
        });

    } catch (error) {
        console.error("Error generando Leaderboard interactivo:", error);
        preloadCache.clear();
        return int.editReply({ content: t('commands.top.errorGenerating', {}, serverLang) });
    }
}}