//slash/botstatus.js
const { t } = require('../../utils/i18n.js');
const { dependencies } = require('../../package.json');
const config = require("../../config.json")

module.exports = {
metadata: {
    name: "botstatus",
    description: t('commands.botstatus.metadata_description')
},

async run(client, int, tools) {

    let db = await tools.fetchSettings(int.user.id, int.guild.id)
    let serverLang = db?.settings?.lang || config.defaultLanguage || 'es';

    let versionNumber = client.version.version != Math.round(client.version.version) ? client.version.version : client.version.version.toFixed(1)

    let stats = await client.shard.broadcastEval(cl => ({ guilds: cl.guilds.cache.size, users: cl.users.cache.size }))
    let totalServers = stats.reduce((a, b) => a + b.guilds, 0)

    let botStatus = [
        t('commands.botstatus.creator', {}, serverLang),
        t('commands.botstatus.version', { version: versionNumber, time: Math.round(client.version.updated / 1000) }, serverLang),
        t('commands.botstatus.shard', { id: client.shard.id, count: client.shard.count - 1 }, serverLang),
        t('commands.botstatus.uptime', { time: tools.timestamp(client.uptime) }, serverLang),
        t('commands.botstatus.servers', { total: tools.commafy(totalServers), shardText: client.shard.count == 1 ? "" : t('commands.botstatus.on_shard', { count: tools.commafy(client.guilds.cache.size) }, serverLang) }, serverLang),
        t('commands.botstatus.memory', { ram: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)) }, serverLang)
    ]

    let embed = tools.createEmbed({
        author: { name: client.user.displayName, iconURL: client.user.avatarURL() },
        color: tools.COLOR, timestamp: true, footer: t('commands.botstatus.pinging', {}, serverLang),
        description: botStatus.join("\n")
    })

    let infoButtons = [{style: "Link", label: t('commands.botstatus.btn_website', {}, serverLang), url: `${tools.WEBSITE}`}]
    if (config.changelogURL) infoButtons.push({style: "Link", label: t('commands.botstatus.btn_changelog', {}, serverLang), url: config.changelogURL})
    if (config.supportURL) infoButtons.push({style: "Link", label: t('commands.botstatus.btn_support', {}, serverLang), url: config.supportURL})

    int.reply({embeds: [embed], components: tools.row(tools.button(infoButtons)), fetchReply: true}).then(msg => {
        embed.setFooter({ text: t('commands.botstatus.ping_result', { ms: tools.commafy(msg.createdTimestamp - int.createdAt) }, serverLang) })
        int.editReply({ embeds: [embed], components: msg.components })
    })

}}