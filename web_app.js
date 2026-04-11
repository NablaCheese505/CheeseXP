const express = require('express')
const cookieParser = require('cookie-parser')
const timeout = require('connect-timeout')
const cors = require('cors')

const path = require('path')
const mongoose = require("mongoose")
const Discord = require('discord.js')
const { REST } = require("@discordjs/rest")

const Tools = require('./classes/Tools.js')
const Model = require("./classes/DatabaseModel.js");
const LevelUpEmbed = require('./classes/LevelUpEmbed.js')
const LevelUpMessage = require("./classes/LevelUpMessage.js")
const auth = require('./config.json')
const { t, availableLanguages, DEFAULT_LANG } = require('./utils/i18n.js');
const curvePresets = require('./json/curve_presets.json')
const schemaData = require("./database_schema.js")

module.exports = (client) => {

const app = express();
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'app/html'));
const tools = Tools.global

app.use(cookieParser());
app.use(express.json({ limit: '20mb' }));
app.use(timeout('20s'));
app.set('json spaces', 2)

require('express-async-errors') 

const siteURL = tools.WEBSITE

const discordAPI = "https://discord.com/api/v9/"
const discord_auth = discordAPI + `oauth2/authorize?client_id=${process.env.DISCORD_ID}&redirect_uri=${encodeURIComponent(siteURL)}%2Fauth&response_type=code&scope=identify%20guilds`

const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);

const manage_roles = BigInt(Discord.PermissionFlagsBits.ManageRoles)
const manage_messages = BigInt(Discord.PermissionFlagsBits.ManageMessages)
const manage_server = BigInt(Discord.PermissionFlagsBits.ManageGuild)
const server_admin = BigInt(Discord.PermissionFlagsBits.Administrator)

let schema = new mongoose.Schema({
    _id: String,
    access_token: String,
    refresh_token: String,
    expires: Number
}, { collection: "auth" })
let authDB = new Model("auth", schema)

function sendPage(req, res, name, extraData = {}) {
    let userLang = req.acceptsLanguages(availableLanguages) || DEFAULT_LANG;
    
    let renderData = Object.assign({ 
        t, 
        lang: userLang, 
        siteURL: auth.siteURL
    }, extraData);

    return res.render(name, renderData);
}

function sendRedirect(res, name) {
    return res.redirect(name)
}

function canManageServer(guild) {
    if (!guild) return false
    let p = BigInt(guild.permissions)
    return guild.owner || ((p & manage_server) === manage_server) || ((p & server_admin) === server_admin)
}

function botIsPublic() {
    return client.application.fetch().then(x => x.botPublic)
}

function notFalse(val) {
    return val && val != "false" && val != "0"
} 

function clearDeletedData(settings, roles, channels) {
    if (roles) {
        settings.rewards = settings.rewards.filter(x => roles.some(r => r.id == x.id))
        settings.multipliers.roles = settings.multipliers.roles.filter(x => roles.some(r => r.id == x.id))
    }

    if (channels) {
        settings.multipliers.channels = settings.multipliers.channels.filter(x => channels.some(c => c.id == x.id))
        if (settings.levelUp.channel.length > 10 && !channels.some(c => c.id == settings.levelUp.channel)) settings.levelUp.channel = "current"
    }

    return settings
}

app.use("/assets", express.static(__dirname + '/app/assets'));
app.use("/css", express.static(__dirname + '/app/css'));
app.use("/polaris.js", express.static(__dirname + '/app/js/extras.js'));
app.use("/js", express.static(__dirname + '/app/js'));

app.use(function(req, res, next) {
    res.apiError = function(message, code) {
        let error = { apiError: true, message }
        if (code) error.code = code
        return res.status(400).send(error)
    }
    next()
})

const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 150,
    message: { apiError: true, message: "Demasiadas peticiones. Por favor, intenta de nuevo en 5 minutos." }
});

app.use("/api/", apiLimiter);

app.get("/servers", (req, res) => sendPage(req, res, "servers"))
app.get("/settings/:id", (req, res) => sendPage(req, res, "config"))
app.get("/leaderboard/:id", (req, res) => sendPage(req, res, "leaderboard"))
app.get("/", (req, res) => sendPage(req, res, "home"))

app.get(["/settings", "/leaderboard", "/servers"], (req, res) => sendRedirect(res, "/servers"))

if (auth.supportURL) app.get("/support", (req, res) => res.redirect(auth.supportURL))
if (auth.changelogURL) app.get("/changelog", (req, res) => res.redirect(auth.changelogURL))

app.get("/invite/:id?", (req, res) => {
    res.redirect(`https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=429765545024&scope=bot%20applications.commands${req.params.id ? `&guild_id=${req.params.id}` : ""}`)
})

app.get("/api/loggedin", async function(req, res) {
    let botPublic = await botIsPublic()
    let info = await getDiscordInfo(req, true)
    return res.send({ login: info ? { id: info.id, username: info.username } : null, botPublic })
})

app.get("/api/discordinfo", async function(req, res) {
    let info = await getDiscordInfo(req)
    return res.send(info)
})

app.get("/api/guilds", async function(req, res) {
    let [user, guilds] = await getDiscordInfo(req)
    if (!user || !guilds) return res.apiError("Not logged in!", "login")

    let userData = { id: user.id, username: user.username, displayName: user.global_name, avatar: user.avatar, color: user.banner_color }

    let guildList = guilds.map(x => x.id)
    let foundServers = await client.db.find({ "_id": { $in: guildList } }, "settings").catch(() => [])
    let validServers = guilds.filter(x => x.owner || ((BigInt(x.permissions) & manage_server) === manage_server) || foundServers.some(g => g._id == x.id)) 
    let activeIDs = await client.shard.broadcastEval(async (cl, xd) => {
        return xd.ids.filter(x => cl.guilds.cache.has(x))
    }, { context: { ids: validServers.map(x => x.id) } })
    activeIDs = activeIDs.flat()

    validServers = validServers.map(x => {
        let p = BigInt(x.permissions)
        let inServer = activeIDs.includes(x.id)
        let admin = x.owner || ((p & server_admin) === server_admin)
        let perms = {
            owner: x.owner,
            server: admin || ((p & manage_server) === manage_server) || tools.isDev(user),
            roles: admin || ((p & manage_roles) === manage_roles),
            messages: admin || ((p & manage_messages) === manage_messages),
        }
        let foundDB = foundServers.find(g => g._id == x.id)
        let xpEnabled = inServer && foundDB?.settings?.enabled 
        let hasLeaderboard = xpEnabled && !foundDB.settings.leaderboard.disabled 
        return { id: x.id, name: x.name, icon: x.icon, permissions: perms, xp: xpEnabled, inServer, leaderboard: hasLeaderboard, hasData: !!foundDB?.settings }
    })

    let botPublic = await botIsPublic()

    return res.send({ user: userData, guilds: validServers, botPublic })
})

app.get("/api/settings/:id", async function(req, res) {
    let [user, guilds] = await getDiscordInfo(req)
    if (!user || !guilds) return res.apiError("Not logged in!", "login")
    let serverID = req.params.id
    if (!serverID) return res.apiError("Invalid server ID!")

    let force = tools.isDev(user)

    let foundGuild = guilds.find(x => x.id == serverID)
    if (!foundGuild && !force) return res.apiError("Missing permissions!", "noPerms")

    let canManage = force || canManageServer(foundGuild)
    if (!canManage) return res.apiError("Missing permissions!", "noPerms")

    let serverData = await client.db.fetch(serverID, ["settings", "info"]) || await client.db.create({ _id: serverID })
    if (!serverData) return res.apiError("No server data!");

    let guildData = await client.shard.broadcastEval(async (cl, xd) => {
        const Discord = require('discord.js')
        const path = require("path")
        const Tools = require(path.join(xd.dir, "/classes/Tools.js"))
        const ChannelType = Discord.ChannelType
        let tools = Tools.global
        let guild = cl.guilds.cache.get(xd.guildID)
        if (!guild) return null

        let server = {
            name: guild.name,
            icon: guild.iconURL({format: "png", dynamic: true}),
            members: guild.memberCount
        }

        let roles = guild.roles.cache.sort((a, b) => b.position - a.position).map(x => ({
            id: x.id,
            name: x.name,
            color: x.hexColor,
            managed: x.managed,
            grantable: x.editable && x.id != guild.id
        }))

        let channels = guild.channels.cache
        .filter(x => x && (x.isTextBased() || x.type == ChannelType.GuildCategory || x.type == ChannelType.GuildForum || x.isVoiceBased()))
        .sort((a, b) => {
            let channelA = tools.getTrueChannelPos(a, ChannelType)
            let channelB = tools.getTrueChannelPos(b, ChannelType)
            return (channelA.group - channelB.group) || (channelA.section - channelB.section) || (channelA.position - channelB.position)
        }).map(x => ({
            id: x.id,
            name: x.name,
            pos: x.position,
            type: x.type == ChannelType.GuildForum ? "forum" : x.type == ChannelType.GuildCategory ? "category" : x.isVoiceBased() ? "vc" : x.isThread() ? "thread" : "channel",
            threads: x.threads?.cache?.size || undefined
        }))

        return { server, roles, channels }

    }, { context: { guildID: serverID, dir: __dirname } })
    .then(x => x.find(r => r)) 
    .catch(console.error)

    if (!guildData) return res.apiError("Could not fetch server info!");

    let guildInfo = {
        name: guildData.server.name || foundGuild?.name || serverID,
        id: serverID,
        icon: guildData.server.icon,
        members: guildData.server.members || 0,
        lastUpdate: serverData.info.lastUpdate
    }
    if (force) guildInfo.botDev = true

    serverData.settings = clearDeletedData(serverData.settings, guildData.roles, guildData.channels)

    let lvlMessage = serverData.settings.levelUp.message
    if (serverData.settings.levelUp.embed && lvlMessage) {
        serverData.settings.levelUp.message = JSON.stringify(JSON.parse(lvlMessage), null, 2)
    }

    let ownedServers = guilds.filter(x => x.owner && x.id != serverID).map(x => ({ name: x.name, id: x.id }))

    return res.send({ guild: guildInfo, settings: serverData.settings, roles: guildData.roles, channels: guildData.channels, ownedServers, curvePresets })
})

function validateSetting(val, setting, guildData={}) {
    switch (setting.type) {
        case "bool":
            return notFalse(val)
        case "int": case "float":
            let numVal = setting.type == "int" ? Math.round(val) : Number(Number(val).toFixed(setting.precision || 4))
            if (isNaN(numVal)) return setting.default
            else return tools.clamp(numVal, setting.min, setting.max)
        case "string":
            let strVal = String(val).slice(0, setting.maxlength || 64).trim()
            if (setting.accept) {
                let acceptList = setting.accept.filter(x => !x.startsWith("discord:"))
                if (setting.accept.includes("discord:role")) acceptList = acceptList.concat(guildData.roles)
                if (setting.accept.includes("discord:channel")) acceptList = acceptList.concat(guildData.channels)
                let foundAccept = acceptList.includes(strVal)
                if (!foundAccept) strVal = null
            }
            return strVal || setting.default
        case "collection":
            let collection = []
            if (!val || !Array.isArray(val)) return []
            val.forEach(x => {
                let validated = {}
                Object.entries(x).forEach(s => {
                    let [innerKey, innerVal] = s
                    let foundSetting = setting.values[innerKey]
                    if (foundSetting) validated[innerKey] = validateSetting(innerVal, foundSetting, guildData)
                })
                collection.push(validated)
            })
            return collection
    }
}

app.post("/api/settings", async function(req, res) {
    if (typeof req.body != "object") return res.apiError("Invalid save data!");
    let guildID = req.body.guildID
    if (!guildID) return res.apiError("No guild ID!");
    let [user, guilds] = await getDiscordInfo(req)
    if (!user || !guilds) return res.apiError("Not logged in!")

    let force = tools.isDev(user);

    let foundGuild = guilds.find(x => x.id == guildID)
    if (!foundGuild && !force) return res.apiError("Not in server!")

    let canManage = canManageServer(foundGuild)
    if (!canManage && !force) return res.apiError("Manage server permission required!")

    if (req.body.resetSettings) {
        return client.db.update(guildID, { $unset: { "settings": "x" }, $set: { "info.lastUpdate": Date.now() } }).exec().then(() => {
            return res.end("All settings reset!")
        }).catch(console.error)
    }

    else if (req.body.resetXP) {
        return client.db.update(guildID, { $unset: { "users": "x" } }).exec().then(() => {
            return res.end("All XP reset!")
        }).catch(console.error)
    }

    let guildData = await client.shard.broadcastEval(async (cl, xd) => {
        let guild = cl.guilds.cache.get(xd.guildID)
        if (!guild) return null

        return {
            roles: guild.roles.cache.map(x => x.id),
            channels: guild.channels.cache.map(x => x.id)
        }
    }, { context: { guildID } })
    .then(x => x.find(r => r))
    .catch(console.error)
    if (!guildData) return res.apiError("Could not fetch server info!");

    let dbObj = { }
    Object.entries(req.body).forEach(x => {
        let [key, val] = x
        let setting = schemaData.settingsIDs[key]
        if (!setting) return
        else dbObj["settings." + setting.db] = validateSetting(val, setting, guildData)
    })

    if (dbObj["settings.levelUp.embed"] && dbObj["settings.levelUp.message"]) {
        let lvlEmbed = new LevelUpEmbed(dbObj["settings.levelUp.message"])
        if (lvlEmbed.invalid) {
            dbObj["settings.levelUp.message"] = ""
            dbObj["settings.levelUp.embed"] = false
        }
        else dbObj["settings.levelUp.message"] = JSON.stringify(lvlEmbed.json())
    }

    let xpMin = dbObj["settings.gain.min"]
    let xpMax = dbObj["settings.gain.max"]
    if (xpMin > xpMax) {
        dbObj["settings.gain.min"] = xpMax
        dbObj["settings.gain.max"] = xpMin
    }

    if (dbObj["settings.curve.3"] == 0 && dbObj["settings.curve.2"] == 0 && dbObj["settings.curve.1"] == 0) dbObj["settings.curve.1"] = 1

    dbObj['info.lastUpdate'] = Date.now()

    client.db.update(guildID, { $set: dbObj }).exec().then(() => {
        return res.end("cool and good")
    }).catch(console.error)

})

app.post("/api/sendexample", async function(req, res) {
    if (typeof req.body != "object") return res.apiError("Invalid data!");
    if (!req.body.message) return res.apiError("No message!")

    let guildID = req.body.guildID
    if (!guildID) return res.apiError("No guild ID!");

    let [user, guilds] = await getDiscordInfo(req)
    if (!user || !guilds) return res.apiError("Not logged in!")

    let foundGuild = guilds.find(x => x.id == guildID)
    if (!foundGuild) return res.apiError("Not in server!")

    let canManage = canManageServer(foundGuild)
    if (!canManage) return res.apiError("Manage server permission required!")

    let forceLevel = req.body.level ? tools.clamp(Math.round(req.body.level), 1, 1000) : null

    let guildData = await client.shard.broadcastEval(async (cl, xd) => {
        let guild = cl.guilds.cache.get(xd.guildID)
        if (!guild) return null

        let server = {
            icon: guild.iconURL({format: "png", dynamic: true}),
        }

        let roles = guild.roles.cache.map(x => ({name: x.name, id: x.id}))

        let member = await guild.members.fetch(xd.userID).then(x => ({
            displayName: x.displayName,
            avatar: x.displayAvatarURL(),
            color: x.displayHexColor
        })).catch(() => ({}))

        return { server, roles, member }
    }, { context: { guildID, userID: user.id } })
    .then(x => x.find(r => r))
    .catch(console.error)

    if (!guildData) return res.apiError("Could not fetch server info!");
 
    let data = await client.db.fetch(guildID, ["settings", `users.${user.id}`])
    if (!data || !data.settings) return res.apiError("No data!")
    let currentXP = forceLevel ? tools.xpForLevel(forceLevel, data.settings) : (data.users || [])[user.id]?.xp || 42069
    let currentLevel = forceLevel || tools.getLevel(currentXP, data.settings) || 1

    let msgData = {
        author: {
            id: user.id,
            username: user.username,
            displayName: user.global_name,
            discriminator: user.discriminator || "0",
        },
        member: {
            displayName: guildData.member.displayName || user.global_name || user.username,
            avatarLink: guildData.member.avatar || `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}`
        },
        guild: {
            id: foundGuild.id,
            name: foundGuild.name,
            iconLink: guildData.server.icon || `https://cdn.discordapp.com/icons/${foundGuild.id}/${foundGuild.icon || "nope"}`
        },
        channel: {
            id: "944290668086448148",
            name: "channel"
        }
    }

    data.settings.levelUp.embed = !!req.body.embed
    data.settings.levelUp.message = req.body.message.slice(0, schemaData.settings.levelUp.message.maxlength)

    let lvlMessage = new LevelUpMessage(data.settings, msgData, { level: currentLevel, roleList: guildData.roles, userData: { xp: currentXP }, example: true })
    if (lvlMessage.invalid) return res.apiError("Embed is invalid!");
     
    let fetchedUser = await client.users.fetch(user.id)
    fetchedUser.send( lvlMessage.msg )
    .then(() => res.end(JSON.stringify(lvlMessage.msg, null, 2)))
    .catch((e) => {
        fetchedUser.send(`**Error sending level up message!**\n\`\`\`${e.message}\`\`\``)
        .then(() => res.end("Error: " + e.message))
        .catch(() => {
            return res.apiError("Could not fetch server info!");
        })
    })
})

app.post("/api/pruneMembers", async function(req, res) {
    if (typeof req.body != "object") return res.apiError("Invalid data!");
    let num = Number(req.body.amount)

    if (!num || num <= 0) return res.apiError("No amount!")

    let guildID = req.body.guildID
    if (!guildID) return res.apiError("No guild ID!");

    let [user, guilds] = await getDiscordInfo(req)
    if (!user || !guilds) return res.apiError("Not logged in!")

    let foundGuild = guilds.find(x => x.id == guildID)
    if (!foundGuild) return res.apiError("Not in server!")

    let canManage = canManageServer(foundGuild)
    if (!canManage) return res.apiError("Manage server permission required!")

    let users = await client.db.fetch(guildID, ["users"]).then(x => x.users)
    let vals = Object.entries(users || {})
    let toPrune = vals.filter(x => (x[1].xp || 0) < num).length

    if (req.body.confirmPrune != "hell yes") {
        return res.send({ total: vals.length, matches: toPrune })
    }

    else {
        let newUsers = {}
        vals.forEach(x => {
            if ((x[1].xp || 0) >= num) newUsers[x[0]] = x[1]
        })
        client.db.update(guildID, { $set: { users: newUsers } }).exec().then(() => {
            return res.end(`Successfully pruned ${toPrune} user${toPrune == 1 ? "" : "s"}!`)
        }).catch(console.error)
    }

})

const importCooldowns = {}

app.post("/api/importfrombot", async function(req, res) {
    req.clearTimeout()
    req.setTimeout(60000)
    
    if (typeof req.body != "object" || !req.body.import || typeof req.body.import != "object") return res.apiError("Invalid data!");

    let guildID = req.body.guildID
    if (!guildID) return res.apiError("No guild ID!");

    let [user, guilds] = await getDiscordInfo(req)
    if (!user || !guilds) return res.apiError("Not logged in!")

    let isDev = tools.isDev(user)

    let foundGuild = guilds.find(x => x.id == guildID)
    if (!foundGuild && !isDev) return res.apiError("Not in server!")

    let canManage = canManageServer(foundGuild)
    if (!canManage && !isDev) return res.apiError("Manage server permission required!")

    let importSettings = req.body.import || {}
    let bot = importSettings.bot

    if (!Object.keys(importSettings).some(x => x != "bot")) return res.apiError("Invalid import options!")

    if (bot == "json") {
        if (!req.body.jsonData) return res.apiError("No .json data provided!")    
        if (!isDev) importSettings.settings = null;  
        else importSettings.isDev = true;
    }

    let importCode = `${guildID}-${bot}`
    if (importCooldowns[importCode] && importCooldowns[importCode] >= Date.now()) return res.apiError(`Please wait ${tools.time(importCooldowns[importCode] - Date.now(), 1)} seconds before the next import!`, "importCooldown")

    let newData;
    if (bot == "polaris") newData = await require("./commands/misc/polaris_transfer.js").run(client, guildID, importSettings, guilds)
    else if (bot == "json") newData = await require("./commands/misc/json_import.js").run(client, guildID, importSettings, req.body.jsonData)

    if (newData && newData.error) return res.apiError(newData.error, newData.code)
    else if (!newData || !newData.data || !Object.keys(newData.data).length) return res.apiError("No data!", "noData")

    else {
        client.db.update(guildID, { $set: newData.data }).exec()
        .then(() => {
            importCooldowns[importCode] = Date.now() + 60000
            res.end("Successfully imported!\n" + (newData.details || []).map(x => "- " + x).join("\n"))
        })
        .catch((e) => {
            console.error(e)
            if (bot == "json") return res.apiError(`The database rejected your json! Are the settings you provided valid? (Error: ${e.message})`)
            else return res.apiError(`Database error: ${e.message}`)
        })
    }
})

app.get("/api/leaderboard/:id", cors(), async function(req, res) {
    let guildID = req.params.id

    let data = await client.db.fetch(guildID)
    if (!data) return res.apiError("Invalid server!", "invalidServer");

    let settings = data.settings
    if (!settings.enabled) return res.apiError("XP is disabled in this server!", "xpDisabled")

    let singleUser = (req.query.user && req.query.user.match(/^\d{10,30}$/) ? req.query.user : null)

    let [userInfo, guildInfo] = singleUser ? [null, null] : await getDiscordInfo(req)
    let loggedIn = userInfo && guildInfo && userInfo.id
    let isInGuild = loggedIn && guildInfo.find(x => x.id == guildID)

    let isDev = tools.isDev(userInfo)
    let isMod = loggedIn && canManageServer(guildInfo.find(x => x.id == guildID))

    if (!isMod && settings.leaderboard.disabled) return res.apiError("The leaderboard is disabled in this server!", "leaderboardDisabled")

    if (settings.leaderboard.private && !isInGuild) return res.apiError(loggedIn ? "Only server members can access this leaderboard!" : "This leaderboard is private! Login is required.", "privateLeaderboard")

    let minLeaderboardXP = settings.leaderboard.minLevel > 1 ? tools.xpForLevel(settings.leaderboard.minLevel, settings) : 0

    let rewardList = settings.leaderboard.hideRoles ? [] : settings.rewards.filter(x => x.level <= settings.maxLevel)
    let importantRoles = settings.multipliers.roles.concat(rewardList).map(x => x.id)
    
    let xpArray = []
    let hiddenMembers = []

    Object.entries(data.users || {}).forEach(x => {
        if (!x || !x[0] || !x[1].xp || x[1].xp <= 0) return
        let isHidden = x[1].hidden
        if (!isHidden) xpArray.push(x)
        else if (isMod || isDev) hiddenMembers.push({ id: x[0], xp: x[1].xp })
    })

    xpArray = xpArray.sort((a, b) => b[1].xp - a[1].xp)
    .map((x, y) => ({ id: x[0], xp: x[1].xp, rank: y+1 })) 

    if (hiddenMembers.length) hiddenMembers = hiddenMembers.sort((a, b) => b.xp - a.xp)

    let trueTotalXP = xpArray.length
    let foundUser = xpArray.find(x => x.id == userInfo?.id)
    if (!foundUser) {
        let foundHidden = hiddenMembers.find(x => x.id == userInfo?.id)
        if (foundHidden) {
            foundUser = foundHidden
            foundUser.hidden = true
        }
    }
    if (singleUser) xpArray = xpArray.filter(x => x.id == singleUser)
    if (minLeaderboardXP > 0) xpArray = xpArray.filter(x => x.xp > minLeaderboardXP)
    if (settings.leaderboard.maxEntries > 0) xpArray = xpArray.slice(0, settings.leaderboard.maxEntries)

    let pageSize = tools.clamp(parseInt(req.query.pageSize || 100), 1, 100)
    let pageCount = Math.ceil(xpArray.length / pageSize)
    let page = Math.max(1, parseInt(req.query.page)) || 1
    
    let paginated = xpArray.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
    let memberList = paginated.map(x => x.id)
    if (loggedIn && !memberList.includes(userInfo.id)) memberList.push(userInfo.id)
    
    let guildData = await client.shard.broadcastEval(async (cl, xd) => {
        let guild = cl.guilds.cache.get(xd.guildID)
        if (!guild) return null

        let server = {
            name: guild.name,
            icon: guild.iconURL({format: "png", dynamic: true}),
            members: guild.memberCount,
            owner: guild.ownerId,
        }

        let roles = guild.roles.cache.filter(r => xd.importantRoles.includes(r.id)).sort((a, b) => b.position - a.position).map(x => ({
            id: x.id,
            name: x.name,
            color: x.hexColor
        }))

        let members = await guild.members.fetch({user: xd.members}).then(list => list.map(x => ({
            id: x.user.id,
            username: x.user.username,
            displayName: x.user.displayName,
            discriminator: x.user.discriminator || "0",
            nickname: x.nickname,
            avatar: x.displayAvatarURL({format: "png", dynamic: true}),
            color: x.displayHexColor,
            roles: x.roles.cache.filter(r => xd.importantRoles.includes(r.id)).map(r => r.id)
        }) )).catch((() => []))

        return { server, roles, members }

    }, { context: { members: memberList, guildID, importantRoles } })
    .then(x => x.find(r => r)) 
    .catch(console.error)
    
    if (!guildData) return res.apiError("Couldn't get server data!")

    let guildMembers = guildData.members

    settings = clearDeletedData(settings, guildData.roles)
    if (rewardList.length) rewardList = settings.rewards

    paginated = paginated.map(raw => {
        let data = raw
        let found = guildMembers.find(g => g.id == data.id)
        if (found) data = Object.assign(data, found)
        else data.missing = true
        return data
    })

    let userLevel = { noLogin: true }
    if (loggedIn) {
        let foundInPage = paginated.find(x => x.id == userInfo.id && !x.missing)
        if (foundInPage) userLevel = foundInPage
        else {
            let foundAsMember = guildMembers.find(x => x.id == userInfo.id)
            if (!foundAsMember && isInGuild) foundAsMember = {
                partial: true, id: userInfo.id, username: userInfo.username, displayName: userInfo.global_name,
                discriminator: userInfo.discriminator || "0", color: "#" + (userInfo.accent_color || 0xffffff).toString(16),
                avatar: `https://cdn.discordapp.com/avatars/${userInfo.id}/${userInfo.avatar}`, roles: []
            }
            if (foundUser && foundAsMember) userLevel = Object.assign(foundUser, foundAsMember)
            else userLevel = { missing: true, debug: { member: guildMembers.find(x => x.id == userInfo.id)?.id || "-", user: foundUser?.id || "-", info: userInfo?.id || "-" } }
        }
    }
    if (userLevel.partial) delete userLevel.missing

    let importantSettings = {
        enabled: settings.enabled,
        gain: settings.gain,
        curve: settings.curve, rounding: settings.rounding,
        multipliers: { roles: settings.multipliers.roles, rolePriority: settings.multipliers.rolePriority },
        leaderboard: settings.leaderboard,
        rewards: rewardList,
        rankCard: settings.rankCard,
        maxLevel: settings.maxLevel
    }

    if (settings.hideMultipliers) {
        importantSettings.hideMultipliers = true
        importantSettings.multipliers.roles = []
    }

    guildData.server.totalRanked = xpArray.length
    if (xpArray.length < trueTotalXP) guildData.server.totalPartial = true

    return res.send({guild: guildData.server, user: userLevel, leaderboard: paginated, settings: importantSettings, roles: guildData.roles, moderator: isMod, hiddenMembers, pageInfo: { page, pageCount, pageSize } })
})

app.post("/api/editXP", async function(req, res) {
    if (typeof req.body != "object") return res.apiError("Invalid  data!");

    let guildID = req.body.guildID
    if (!guildID) return res.apiError("No guild ID!");

    if (!req.body.user || !/^\d{17,20}$/.test(req.body.user)) {
        return res.apiError("ID de usuario inválido o malicioso!");
    }

    let [user, guilds] = await getDiscordInfo(req)
    if (!user || !guilds) return res.apiError("Not logged in!")

    let foundGuild = guilds.find(x => x.id == guildID)
    if (!foundGuild) return res.apiError("Not in server!")

    let canManage = canManageServer(foundGuild)
    if (!canManage) return res.apiError("Manage server permission required!")

    let newXP = Math.round(req.body.xp)
    if (!newXP && newXP !== 0) return res.apiError("Invalid XP amount!")
    newXP = tools.clamp(newXP, 0, (1e16 - 1))

    let foundXP = await client.db.fetch(guildID, [`users.${req.body.user}`])
    if (!foundXP?.users || !foundXP.users[req.body.user]) return res.apiError("This user isn't ranked!")

    client.db.update(guildID, { $set: { [`users.${req.body.user}.xp`]: newXP } }).exec().then(() => res.end("cool and good"))
    .catch(() => res.apiError("Unknown error!"));
})

app.post("/api/previewRankCard", async function(req, res) {
    if (typeof req.body != "object") return res.apiError("Invalid data!");
    
    let [user, guilds] = await getDiscordInfo(req);
    if (!user) return res.apiError("Not logged in!");

    const RankCard = require('./classes/RankCard.js');
    let tempSettings = req.body.previewSettings || {};

    let mockUserData = {
        username: user.username,
        displayName: user.global_name || user.username,
        avatarURL: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`,
        currentXP: 1450,
        requiredXP: 2000,
        previousLevelXP: 0,
        level: 35,
        isMaxLevel: false,
        rank: 1,
        messagesText: "Previsualización en vivo",
        cooldownText: "00:45",
        multiplierText: "🚀 Rol - 1.5x XP"
    };

    try {
        const rankCardGenerator = new RankCard(mockUserData, tempSettings);
        const imageBuffer = await rankCardGenerator.build();
        
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (e) {
        console.error("Error previsualizando:", e);
        return res.apiError("Error al generar la imagen.");
    }
});

app.post("/api/leaderboardHide", async function(req, res) {
    if (typeof req.body != "object") return res.apiError("Invalid  data!");

    let guildID = req.body.guildID
    if (!guildID) return res.apiError("No guild ID!");

    if (!req.body.user || !/^\d{17,20}$/.test(req.body.user)) {
        return res.apiError("ID de usuario inválido o malicioso!");
    }

    let [user, guilds] = await getDiscordInfo(req)
    if (!user || !guilds) return res.apiError("Not logged in!")

    let foundGuild = guilds.find(x => x.id == guildID)
    if (!foundGuild) return res.apiError("Not in server!")

    let canManage = canManageServer(foundGuild)
    if (!canManage) return res.apiError("Manage server permission required!")

    let setHide = notFalse(req.body.hide)

    let foundXP = await client.db.fetch(guildID, [`users.${req.body.user}`])
    if (!foundXP?.users || !foundXP.users[req.body.user]) return res.apiError("This user isn't ranked!")

    client.db.update(guildID, { $set: { [`users.${req.body.user}.hidden`]: setHide } }).exec().then(() => res.end("cool and good"))
    .catch(() => res.apiError("Unknown error!"));
})

app.get("/api/xp/:id", cors(), async function(req, res) {
    let guildID = req.params.id
    let data = await client.db.fetch(guildID)
    if (!data) return res.apiError("Invalid server!");

    let [user, guilds] = await getDiscordInfo(req)
    if (!user || !guilds) return res.apiError("Not logged in!")

    let force = tools.isDev(user)

    let foundGuild = guilds.find(x => x.id == guildID)
    if (!foundGuild && !force) return res.apiError("Not in server!")

    let canManage = canManageServer(foundGuild)
    if (!canManage && !force) return res.apiError("Manage server permission required!")

    let xpList = tools.xpObjToArray(data.users || []).sort((a, b) => b.xp - a.xp)
    
    let format = (req.query.format || "").toLowerCase()

    switch (format) {

        case "txt": 
            return res.send(xpList.map(x => `${x.id} - ${x.xp}`).join("\n"))

        case "csv": 
            let header = "ID,Total XP\n"
            return res.send(header + xpList.map(x => `${x.id},${x.xp}`).join("\n"))
        
        case "everything": 
            return res.send({ settings: data.settings, users: data.users })
            
        default: 
            return res.send(`[\n${xpList.map(x => `\t{ "id": "${x.id}", "xp": ${x.xp} },`).join("\n").slice(0, -1)}\n]`)
    }
})

// ===== DISCORD OAUTH =====
app.get("/discord", function(req, res) { return res.redirect(discord_auth) })

app.get("/auth", async function(req, res) {
    if (req.query.code && req.query.code.length > 10) { 
        let authCreds = Buffer.from(`${process.env.DISCORD_ID}:${process.env.DISCORD_SECRET}`).toString('base64');

        fetch(discordAPI + "/oauth2/token", {
            method: "POST",
            headers: {
                "Authorization": `Basic ${authCreds}`,
                "Content-type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: req.query.code,
                redirect_uri: siteURL + "/auth"
            })
        }).then(x => x.json()).then(data => {
            if (data["error"]) return sendRedirect(res, "/"); 
            else return storeAuthToken(res, data) 
        }).catch(e => { console.error(e); sendRedirect(res, "/?authorized") })
    }
    else sendRedirect(res, "/?authorized");
})

function storeAuthToken(res, tokens) {
    let randomNumbers = [tools.rng(1e3, 1e4-1), tools.rng(1e4, 1e5-1), tools.rng(1e5, 1e6-1), tools.rng(1e6, 1e7-1), Number(Date.now().toString().slice(-7))]
    let randomID = randomNumbers.map(x => x.toString(16)).join("-") 
    let expiration = Date.now() + (1000 * tokens.expires_in) 
    authDB.delete({ expires: { $lt: Date.now() } }).then(() => {}) 
    authDB.create({ _id: randomID, access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires: expiration }).then((data) => {
        res.cookie("polaris", randomID, { 
            expires: new Date(expiration),
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });
        sendRedirect(res, "/?authorized") 
    }).catch((e) => { console.error(e); sendRedirect(res, "/") })
}

let tokenCache = {} 
async function getDiscordToken(token) {
    if (!token) return null
    let foundCache = tokenCache[token] 
    if (foundCache && foundCache.expires > Date.now()) return foundCache 
    return await authDB.fetch(token).then(data => { 
        if (data && data.access_token && data.expires > Date.now()) { 
            tokenCache[token] = data
            return data
        }
        else return null 
    }).catch(e => null)
}

let discordCache = {} 
async function getDiscordInfo(req, userOnly) {
    let token = await getDiscordToken(req.cookies.polaris) 
    if (!token) return userOnly ? null : [null, null]

    let foundData = discordCache[token] 
    if (foundData && Date.now() <= foundData.expires) return foundData.data 

    let options = { auth: false, headers: { authorization: `Bearer ${token.access_token}` } };
    let userData = await rest.get("/users/@me", options).catch(e => null)
    if (userOnly) return userData || null

    let guilds = await rest.get("/users/@me/guilds", options).catch(e => null)

    if (!userData || !guilds || userData.message || guilds.message || !userData.id) return [null, null] 
    let discordRes = [userData, guilds] 
    discordCache[token] = {data: discordRes, expires: Date.now() + 15000} 
    return discordRes
}

app.get("/logout", async function(req, res) {
    let token = await getDiscordToken(req.cookies.polaris)
    if (!token) return sendRedirect(res, "/")

    fetch(discordAPI + "oauth2/token/revoke", {
        method: "POST",
        headers: { "Content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: auth.id,
            client_secret: auth.secret,
            token
        })
    }).then(() => { 
        res.clearCookie("polaris"); 
        sendRedirect(res, "/"); 
    }).catch(e => sendRedirect(res, "/"))
})

// Limpiador automático de cachés caducadas (Libera RAM)
setInterval(() => {
    let now = Date.now();
    for (let t in tokenCache) {
        if (tokenCache[t].expires <= now) delete tokenCache[t];
    }
    for (let t in discordCache) {
        if (discordCache[t].expires <= now) delete discordCache[t];
    }
}, 3600000); // Se ejecuta cada hora (3600000 ms)

// ===== ERROR HANDLERS =====
app.get("/api", function(req, res) { res.send("ඞ") })

app.get("*", function(req, res) { res.status(404); sendPage(req, res, "404") })

app.use(function (err, req, res, next) {
    if (err && err.message == "Response timeout") res.status(500).send({ apiError: true, internalError: true, message: 'Internal server error! (Timed out)'})
    else {
        console.warn(err)
        res.status(500).send({ apiError: true, internalError: true, message: `Internal server error! (${err.message})`})
    }
})

process.on('uncaughtException', (e) => { console.warn(e) });
process.on('unhandledRejection', (e, p) => { console.warn(e) });

app.listen(auth.serverPort, () => console.log(`Web server online at http://localhost:${auth.serverPort} (${+process.uptime().toFixed(2)} secs)`));

}