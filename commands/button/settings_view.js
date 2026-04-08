const config = require("../../json/quick_settings.json")
const schema = require("../../database_schema.js").settingsIDs
const { t } = require('../../utils/i18n.js');
const botConfig = require("../../config.json");

module.exports = {
metadata: {
    name: "button:settings_view",
},

async run(client, int, tools, selected) {

    let db = await tools.fetchSettings(int.user.id, int.guild.id)
    let serverLang = db?.settings?.lang || botConfig.defaultLanguage || 'en';

    if (!db) return tools.warn("*noData")

    let settings = db.settings
    if (!tools.canManageServer(int.member, settings.manualPerms)) return tools.warn("*notMod")

    let group = selected[1]
    let settingID = selected[2]
    let setting = schema[settingID]

    if (!setting) return tools.warn("Invalid setting!")

    // find group the hard way, if not provided
    if (!group) {
        for (const [g, x] of Object.entries(config)) {
            if (x.find(z => z.db == settingID)) {
                group = g
                break;
            }
        }
    }

    let val = tools.getSettingFromID(settingID, settings)
    let data = config[group].find(x => x.db == settingID)

    let settingName = t(`quick_settings.name_${settingID.replace(/\./g, '_')}`, {}, serverLang);
    if (settingName === `quick_settings.name_${settingID.replace(/\./g, '_')}`) settingName = data.name; // fallback

    let settingDesc = t(`quick_settings.desc_${settingID.replace(/\./g, '_')}`, {}, serverLang);
    if (settingDesc === `quick_settings.desc_${settingID.replace(/\./g, '_')}`) settingDesc = data.desc; // fallback
    
    let settingTipKey = `quick_settings.tip_${settingID.replace(/\./g, '_')}`;
    let settingTip = t(settingTipKey, {}, serverLang);
    if (settingTip === settingTipKey) settingTip = data.tip || ""; // fallback

    function previewSetting(val) {
        let tZero = t(`quick_settings.zero_${settingID.replace(/\./g, '_')}`, {}, serverLang);
        if (tZero !== `quick_settings.zero_${settingID.replace(/\./g, '_')}` && val === 0) return `0 (${tZero})`;
        if (data.zeroText && val === 0) return `0 (${data.zeroText})`
        
        else switch(setting.type) {
            case "bool": return ((data.invert ? !val : val) ? t('quick_settings.trueText', {}, serverLang) : t('quick_settings.falseText', {}, serverLang));
            case "int": return tools.commafy(+val);
            case "float": return tools.commafy(Number(val.toFixed(setting.precision || 8)));
        }
        return val.toString()
    }

    let currentVal = previewSetting(val)
    
    let footer = settingTip;
    if (setting.default !== undefined) footer += `${footer ? "\n" : ""}${t('commands.settings_view.default', {}, serverLang)}: ${previewSetting(setting.default)}`

    let embed = tools.createEmbed({
        color: tools.COLOR,
        title: settingName,
        description: `**${t('commands.settings_view.currentValue', {}, serverLang)}:** ${currentVal}\n\nℹ️ ${settingDesc}`,
        footer: footer || null
    })

    let buttons = tools.button([
        {style: "Secondary", label: t('commands.settings_view.back', {}, serverLang), customID: `settings_list~${group}~${int.user.id}`},
        {style: "Primary", label: (setting.type == "bool") ? t('commands.settings_view.toggle', {}, serverLang) : t('commands.settings_view.edit', {}, serverLang), customId: `settings_edit~${settingID}~${int.user.id}`}
    ])

    tools.editOrReply({embeds: [embed], components: tools.row(buttons)})

}}