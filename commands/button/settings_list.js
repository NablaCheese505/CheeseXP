const Discord = require('discord.js')
const configData = require("../../json/quick_settings.json")
const schema = require("../../database_schema.js").settingsIDs
const { t } = require('../../utils/i18n.js');
const botConfig = require("../../config.json");

const rootFolder = "home"

module.exports = {
metadata: {
    name: "button:settings_list",
},

async run(client, int, tools, selected) {

    let buttonData = [];
    if (int.isButton) {
        buttonData = int.customId.split("~")
        if (buttonData[2] && buttonData[2] != int.user.id) return int.deferUpdate() 
    }

    let db = await tools.fetchSettings(int.user.id, int.guild.id)
    let serverLang = db?.settings?.lang || botConfig.defaultLanguage || 'en';
    if (!db) return tools.warn("*noData")

    let settings = db.settings
    if (!tools.canManageServer(int.member, settings.manualPerms)) return tools.warn("*notMod")

    // displays the preview value for a setting
    function previewSetting(val, data, schema) {
        let tZero = t(`quick_settings.zero_${data.db.replace(/\./g, '_')}`, {}, serverLang);
        if (tZero !== `quick_settings.zero_${data.db}` && val === 0) return tZero;
        if (data.zeroText && val === 0) return data.zeroText; // fallback
        
        switch(schema.type) {
            case "bool": return (data.invert ? !val : val) ? t('quick_settings.trueText', {}, serverLang) : t('quick_settings.falseText', {}, serverLang);
            case "int": return tools.commafy(val);
            case "float": return tools.commafy(Number(val.toFixed(schema.precision || 4)));
        }
        return val.toString()
    }

    function getDataEmoji(type, val) {
        if (type == "bool") return val ? botConfig.emojis.success : botConfig.emojis.error;
        else if (type == "int" || type == "float") return botConfig.emojis.number || "🔢"; 
        else return botConfig.emojis.text || "📝"; 
    }

    let dirName = (selected ? selected[1] : int.isButton ? buttonData[1] : rootFolder) || rootFolder
    let entries = configData[dirName]

    if (!entries) return tools.warn("Invalid category!")

    let rows = []
    let options = []
    
    // Traducción del título principal
    let groupNameKey = entries[0]?.groupName ? `quick_settings.group_${dirName}` : "quick_settings.group_default";
    let groupName = t(groupNameKey, {}, serverLang);
    if (groupName === groupNameKey) groupName = entries[0]?.groupName || "Settings"; // fallback
    
    let isHome = (dirName == rootFolder)

    entries.forEach(x => {
        if (x.groupName) return; // Ya lo procesamos arriba
        
        if (x.folder) {
            let emoji = botConfig.emojis[x.emoji] || x.emoji || "📁"
            let fName = t(`quick_settings.folder_${x.folder}`, {}, serverLang);
            if (fName === `quick_settings.folder_${x.folder}`) fName = x.name; // fallback
            
            rows.push(`${emoji} **${fName}**`)
            options.push({ emoji, label: fName, value: `config_dir_${x.folder}` })
        }

        else if (x.db) {
            let val = tools.getSettingFromID(x.db, settings)
            let sch = schema[x.db]
            
            // Intentar traducir el nombre y descripción del ajuste
            let settingName = t(`quick_settings.name_${x.db.replace(/\./g, '_')}`, {}, serverLang);
            if (settingName === `quick_settings.name_${x.db}`) settingName = x.name; // fallback
            
            let settingDesc = t(`quick_settings.desc_${x.db.replace(/\./g, '_')}`, {}, serverLang);
            if (settingDesc === `quick_settings.desc_${x.db}`) settingDesc = x.desc; // fallback

            rows.push(`**${settingName}**: ${previewSetting(val, x, sch)}`)
            options.push({ emoji: getDataEmoji(sch.type, val), label: settingName, description: tools.limitLength(settingDesc, 95), value: `config_val_${dirName}_${x.db}` })
        }

        if (x.space || x.folder == "home") rows.push("")
    })

    let embed = tools.createEmbed({
        color: tools.COLOR,
        title: groupName,
        description: rows.join("\n"),
        footer: isHome ? t('quick_settings.footer_home', {}, serverLang) : null
    })

    let dropdown = new Discord.StringSelectMenuBuilder()
    .setCustomId(`configmenu_${int.user.id}`)
    .setPlaceholder(isHome ? t('quick_settings.placeholder_home', {}, serverLang) : t('quick_settings.placeholder_setting', {}, serverLang))
    .addOptions(...options)

    tools.editOrReply({ embeds: [embed], components: tools.row(dropdown) }, !buttonData[2])
}}