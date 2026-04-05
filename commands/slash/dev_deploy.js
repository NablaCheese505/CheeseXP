//slash/dev_deploy.js
const config = require("../../config.json")
const DiscordBuilders = require("@discordjs/builders")
const Discord = require("discord.js")
const { REST } = require("@discordjs/rest")
const { Routes } = require("discord-api-types/v9")
const { getLocalizations } = require('../../utils/i18n.js');

function prepareOption(option, arg, commandName, subcommandName = null) {
    option.setName(arg.name.toLowerCase())
    
    if (arg.description) {
        option.setDescription(arg.description);
        let descKey = `commands.${commandName}.args_${arg.name}_desc`;
        if (subcommandName) {
            descKey = `commands.${commandName}.subcommands.${subcommandName}.args_${arg.name}_desc`;
        }
        
        if (arg.description.startsWith('commands.')) {
            descKey = arg.description;
        }

        const localizations = getLocalizations(descKey);
        if (Object.keys(localizations).length > 0) {
            option.setDescriptionLocalizations(localizations);
        }
    }

    if (arg.required) option.setRequired(true)
    return option
}

function createSlashArg(data, arg, commandName) {
    switch (arg.type) {
        case "subcommand":
            return data.addSubcommand(cmd => {
                cmd.setName(arg.name)
                cmd.setDescription(arg.description)
                
                let subDescKey = `commands.${commandName}.args_${arg.name}_desc`;
                if(arg.description.startsWith('commands.')){
                     subDescKey = arg.description;
                }
                const subLocalizations = getLocalizations(subDescKey);
                if (Object.keys(subLocalizations).length > 0) {
                     cmd.setDescriptionLocalizations(subLocalizations);
                }

                if (arg.args?.length) arg.args.forEach(a => { createSlashArg(cmd, a, commandName) })
                return cmd
            })
        case "string":
            return data.addStringOption(option => {
                prepareOption(option, arg, commandName)
                if (arg.choices) option.setChoices(...arg.choices)
                return option
            })
        case "integer": case "number":
            return data.addIntegerOption(option => {
                prepareOption(option, arg, commandName)
                if (arg.choices) option.setChoices(...arg.choices)
                if (!isNaN(arg.min)) option.setMinValue(arg.min)
                if (!isNaN(arg.max)) option.setMaxValue(arg.max)
                return option
            })
        case "float":
            return data.addNumberOption(option => {
                prepareOption(option, arg, commandName)
                if (arg.choices) option.setChoices(...arg.choices)
                if (!isNaN(arg.min)) option.setMinValue(arg.min)
                if (!isNaN(arg.max)) option.setMaxValue(arg.max)
                return option
            })
        case "channel":
            return data.addChannelOption(option => {
                prepareOption(option, arg, commandName)
                if (arg.types) option.addChannelTypes(arg.types)
                else if (arg.acceptAll) option.addChannelTypes([0, 2, 4, 5, 10, 11, 12, 13, 15, 16]) // lol
                else option.addChannelTypes([Discord.ChannelType.GuildText, Discord.ChannelType.GuildAnnouncement])
                return option
            })
        case "bool": return data.addBooleanOption(option => prepareOption(option, arg, commandName))
        case "file": return data.addAttachmentOption(option => prepareOption(option, arg, commandName))
        case "user": return data.addUserOption(option => prepareOption(option, arg, commandName))
        case "role": return data.addRoleOption(option => prepareOption(option, arg, commandName))
    } 
}

module.exports = {
metadata: {
    dev: true,
    name: "deploy",
    description: "(dev) Deploy/sync the bot's commands.",
    args: [
        { type: "bool", name: "global", description: "Publish the public global commands instead of dev ones", required: false },
        { type: "string", name: "server_id", description: "Deploy dev commands to a specific server", required: false },
        { type: "bool", name: "undeploy", description: "Clears all dev commands from the server (or global if it's set to true)", required: false }    
    ]
},

async run(client, int, tools) {

    let isPublic = int && !!int.options.get("global")?.value
    let undeploy = int && !!int.options.get("undeploy")?.value
    let targetServer = (!int || isPublic) ? null : int.options.get("server_id")?.value

    let interactionList = []
    if (!undeploy) client.commands.forEach(cmd => {
        let metadata = cmd.metadata
        if (isPublic && metadata.dev) return
        else if (!isPublic && !metadata.dev) return

        switch (metadata.type) {
            case "user_context": case "message_context": 
                let ctx = { name: metadata.name, type: metadata.type == "user_context" ? 2 : 3, dm_permission: !!metadata.dm, contexts: [0] }
                
                // Intento de localizar el nombre del comando de contexto
                const ctxLocalizations = getLocalizations(`commands.${metadata.name}.name`);
                if(Object.keys(ctxLocalizations).length > 0){
                    ctx.name_localizations = ctxLocalizations;
                }
                
                interactionList.push(ctx);
                break;

            case "slash": // slash commands
                let data = new DiscordBuilders.SlashCommandBuilder()
                data.setName(metadata.name.toLowerCase())
                data.setContexts([0])
                if (metadata.dev) data.setDefaultMemberPermissions(0)
                else if (metadata.permission) data.setDefaultMemberPermissions(Discord.PermissionFlagsBits[metadata.permission])
                
                if (metadata.description) {
                    data.setDescription(metadata.description);
                    
                    // Obtener la clave original o intentar adivinarla
                    let descKey = `commands.${metadata.name}.metadata_description`;
                    if (metadata.description.startsWith('commands.')){
                        descKey = metadata.description;
                    }
                    
                    const localizations = getLocalizations(descKey);
                    if (Object.keys(localizations).length > 0) {
                        data.setDescriptionLocalizations(localizations);
                    }
                }
                
                if (metadata.args) metadata.args.forEach(arg => {
                    return createSlashArg(data, arg, metadata.name)
                })
                interactionList.push(data.toJSON())
                break;
        }
    })

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    if (isPublic) {
        const route = Routes.applicationCommands(process.env.DISCORD_ID)
        rest.put(route, { body: interactionList })
        .then(() => {
            if (int) int.reply(`**${!undeploy ? `${interactionList.length} global commands registered!` : "Global commands cleared!"}** (Wait a bit, or refresh with Ctrl+R to see changes)`)
            else console.info("Global commands registered!") 
            client.shard.broadcastEval(cl => { cl.application.commands.fetch(); return }) 
        }).catch(e => console.error(`Error deploying global commands to ${id}: ${e.message}`));
    }
    else {
        let serverIDs = targetServer ? [targetServer] : (int?.guild) ? [int.guild.id] : config.test_server_ids
        if (!serverIDs) return console.warn("Cannot deploy dev commands! No test server IDs provided in config.")
        
        serverIDs.forEach(id => {
            const route = Routes.applicationGuildCommands(process.env.DISCORD_ID, id)
            rest.put(route, { body: interactionList })
            .then(() => {
                let msg = `Dev commands registered to ${id}!`
                if (int) int.reply(undeploy ? "Dev commands cleared!" : id == int.guild.id ? "Dev commands registered!" : msg)
                else console.info(msg) 
            }).catch(e => console.error(`Error deploying dev commands to ${id}: ${e.message}`));
        })
    }
}}