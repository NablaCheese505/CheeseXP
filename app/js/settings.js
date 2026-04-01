addUhOh()

    let guildID = window.location.pathname.split("/").pop().split("-")[0]
    let serverName = guildID
    let lastUpdated = 0

    const multiplierDescriptions = {
        role: {
            largest: "If you have 0.5x and 2.0x role multipliers, 2.0x will be picked.",
            smallest: "If you have 0.5x and 2.0x role multipliers, 0.5x will be picked.",
            highest: "If you have multiple role multipliers, the highest listed role will be picked.",
            add: "If you have 1.5x, 2.0x, and 0.75x role multipliers, they will be summed together as to 2.25x. (add n-1 from each)",
            combine: "If you have 2.0x and 3.0x role multipliers, they will be multiplied to 6.0x. Scales absurdly fast."
        },

        channel: {
            multiply: "If your role is 2.0x and the channel is 3.0x, final multiplier is 6.0x.",
            add: "If your role is 2.0x and the channel is 1.5x, they will be summed together to 2.5x. (add n-1 from each)",
            largest: "If your role is 2.0x and the channel is 1.5x, 2.0x will be picked because it's higher.",
            channel: "If the channel has any multiplier (including 1.0x), always use it instead of the role.",
            role: "If you have any role multiplier (including 1.0x), always use it instead of the channel."
        }
    }

    Fetch(`/api/settings/${guildID}`).then(data => {

        console.log(data)

        let db = data.settings
        serverName = data.guild.name
        document.title = "Settings for " + serverName
        lastUpdated = data.guild.lastUpdate || 0

        // curve graph ft. desmos
        let desmosConfig = {
            fontSize: 14,
            expressions: false,
            invertedColors: true,
            advancedStyling: true,
            restrictGridToFirstQuadrant: true,
            xAxisLabel: "Level",
            yAxisLabel: "XP Required",
            backgroundColor: "#202020",
        }

        let desmosBounds = {
            left: 0,
            bottom: 0,
            right: 50,
            top: 10 ** 5.5
        }

        // failsafe in case the desmos api breaks
        let desmosGraph = typeof Desmos != "undefined" ? Desmos.GraphingCalculator(document.getElementById('xpGraph'), desmosConfig) : null
        if (desmosGraph) {
            desmosGraph.setMathBounds(desmosBounds)
            desmosGraph.setDefaultState(desmosGraph.getState())
        }
        else $('#desmosJumpscare').removeAttr("style").text("Looks like Desmos failed to load ¯\\_(ツ)_/¯")

        $('.serverName').text(data.guild.name)
        $('.serverMembers').text(commafy(data.guild.members || "?") + " member" + (data.guild.members == 1 ? "" : "s"))
        $('.serverIcon').attr('src', data.guild.icon || "/assets/avatar.png")
        $('#otherServers').append(data.ownedServers.map(x => `<option value="${x.id}">${x.name}</option>`))
        
        // fill in inputs with current values
        $('input[db], select[db]').each(function() {
            let dbKey = $(this).attr('db').split('.')
            let dbVal = db
            while (dbKey.length) dbVal = dbVal[dbKey.shift()]
            if ($(this).attr('type') == "checkbox") $(this).prop("checked", $(this).attr("invert") ? !dbVal : dbVal)
            else $(this).val(dbVal || dbVal === 0 ? dbVal : $(this).attr('default'))
        })
        
        // number placeholders, show range
        $('input[type="number"][min][max]').each(function() {
            if (!$(this).attr("placeholder")) $(this).attr("placeholder", `${$(this).attr("min")} - ${$(this).attr("max")}`)
        })

        // fill in curve table
        let curvePreviewNumbers = [1, 2, 3, 4, 5, 7, 10, 25, 50, 100, 200]
        buildCurveTable($('#curvePreview'), curvePreviewNumbers, db.curve, db.rounding, db.gain.min, db.gain.max, db.gain.time)
        displayCurveDifficulty(db.curve, $('#scaleDifficulty'))

        // swap min and max if max is lower
        function checkMinMax() {
            let max = +$('#num_max').val()
            let min = +$('#num_min').val()
            if (min > max) {
                $('#num_min').val(max)
                $('#num_max').val(min)
            }
        }

        // update curve on change
        $('input[updatecurve]').blur(function() {
            checkMinMax()
            updateCurveTable()
        })

        // update cooldown time on change
        $('#num_time').on("input change blur", function() {
            let val = Number($(this).val())
            if (val >= 60) {
                $('#cooldownunit').text(`(${timeStr(val * 1000, 1)})`)
                $('#cooldownunit').show()
            }   
            else $('#cooldownunit').hide()
        })
        $('#num_time').trigger('change')

        // curve presets
        let presets = data.curvePresets.presets
        presets.unshift({
            "name": data.guild.name,
            "desc": "The custom settings that your server currently uses.",
            "curve": db.curve,
            "round": db.rounding,
            "bestRange": [db.gain.min, db.gain.max]
        })

        presets.forEach(x => {
            $('#curvePresets').append(`<option value="${x.name}">${x.name}</option>`)
        })

        let foundPreset = presets.find(x => x.name != data.guild.name && JSON.stringify([x.curve, x.round, x.bestRange]) == JSON.stringify([db.curve, db.rounding, [db.gain.min, db.gain.max]])) || presets[0]
        $("#curvePresets").val(foundPreset.name)

        // on curve preset selection
        $('#curvePresets').change(function() {
            let newVal = $(this).val()
            let foundPreset = presets.find(x => x.name == newVal) || presets[0]
            $('#presetDesc').html(foundPreset.desc)
            $('#presetCurve').html(`${+foundPreset.curve[3].toFixed(4)}x<sup>3</sup> + ${+foundPreset.curve[2].toFixed(4)}x<sup>2</sup> + ${+foundPreset.curve[1].toFixed(4)}x`)
            $('#presetRound').html(foundPreset.round)
            $('#presetXP').html(foundPreset.bestRange.join(" - "))
            displayCurveDifficulty(foundPreset.curve, $('#presetDifficulty'))
        })
        $('#curvePresets').trigger('change') // default preset

        // on preset apply
        $('#applyPreset').click(function() {
            let foundPreset = presets.find(x => x.name == $('#curvePresets').val())
            if (!foundPreset) return
            $("#num_round").val(foundPreset.round)
            $("#num_min").val(foundPreset.bestRange[0])
            $("#num_max").val(foundPreset.bestRange[1])
            $("#num_curve1").val(foundPreset.curve[1])
            $("#num_curve2").val(foundPreset.curve[2])
            $("#num_curve3").val(foundPreset.curve[3])
            $("#curveStuff")[0].scrollIntoView()
            updateCurveTable()
            checkUnsavedChanges()
        })

        // xp curve table update
        function updateCurveTable() {
            let newCurve = { 3: +$('#num_curve3').val(), 2: +$('#num_curve2').val(), 1: +$('#num_curve1').val() }
            if (!newCurve[3] && !newCurve[2] && !newCurve[1]) {
                $('#num_curve1').val(1)
                newCurve[1] = 1
            }

            let tableArgs = [newCurve, +$("#num_round").val(), +$("#num_min").val(), +$("#num_max").val(), +$("#num_time").val()]

            buildCurveTable($('#curvePreview'), curvePreviewNumbers, ...tableArgs)
            if ($('#fullPreviewSection').is(":visible")) buildCurveTable($('#fullCurvePreview'), 500, ...tableArgs, true)
            displayCurveDifficulty(newCurve, $('#scaleDifficulty'))
        }

        // expanded curve table
        $('#showMoreCurveInfo').click(function() {
            let isVisible = $('#fullPreviewSection').toggle()
            if ($('#fullPreviewSection').is(":visible")) updateCurveTable()
        })

        // xp curve table
        function buildCurveTable(element, levels, curve={}, rounding=100, min=50, max=100, time=60, extra) {
            if (!Array.isArray(levels)) {
                let maxLevel = parseInt(levels) || 1000
                levels = []
                for (let i=1; i <= maxLevel; i++) levels.push(i)
            }

            let columns = [
                {name: "Level", id: "level"},
                {name: "XP", id: "xp", extra: true},
                {name: "Messages", id: "msgs", extra: true},
                {name: "Cooldown Time", id: "time", extra: true},
                {name: "Total XP", id: "cum_xp"},
                {name: "Total Messages", id: "cum_msgs"},
                {name: "Total Cooldown", id: "cum_time"}
            ]

            if (!extra) columns = columns.filter(x => !x.extra)

            element.empty();
            element.append(columns.map(x => `<div col="${x.id}"><p><b>${x.name}</b></p></div>`))
            
            levels.forEach(lvl => {

                let xpRequired = getXPForLevel(lvl, curve, rounding)
                let previousRequired = getXPForLevel(lvl - 1, curve, rounding)
                let relativeRequired = Math.round(xpRequired - previousRequired)

                let msgsRequired = getAvgMessagesRequired(min, max, relativeRequired)
                let cumMsgsRequired = getAvgMessagesRequired(min, max, xpRequired)

                let totalTime = msgsRequired * time
                let cumTime = cumMsgsRequired * time
                let apx = min == max ? "" : "~ "

                columns.forEach(col => {

                    let column = element.find(`div[col=${col.id}]`)
                    let val = 0

                    switch(col.id) {
                        case "level": val = commafy(lvl); break;
                        case "xp": val = "+ " + commafy(relativeRequired); break;
                        case "msgs": val = apx + commafy(msgsRequired); break;
                        case "time": val = apx + timeStr(totalTime * 1000, 1, false, true); break;
                        case "cum_xp": val = commafy(xpRequired); break;
                        case "cum_msgs": val = apx + commafy(cumMsgsRequired); break;
                        case "cum_time": val = apx + timeStr(cumTime * 1000, 1, false, true)
                    }
                    column.append(`<p>${val}</p>`)
                })
            })

            if (desmosGraph) {
                desmosGraph.setExpression({ id: 'xp', color: "#0080FF", latex: `y = ${curve[3]}x^3 + ${curve[2]}x^2 + ${curve[1]}x \\{x>=0\\}` })
                // desmosGraph.setExpression({ id: 'required', color: "#FF0080", latex: `y = ${curve[3] * 3}x^2 + ${curve[2] * 2}x + ${curve[1]} \\{x>=0\\}` })
            }

            let curveDiff = getCurveDifficulty(curve)
            element.attr("difficulty", curveDiff)
            return curveDiff
        }

        // home tab
        let categorySlot = $('.categoryBox').clone()
        $('.categoryBox').remove()
        $('.category').each(function(index) {
            if (index == 0 || $(this).hasClass("unlisted")) return
            let cSlot = categorySlot.clone()
            cSlot.find('h2[cat=name]').text($(this).find('p').text())
            cSlot.find('p[cat=info]').text($(this).attr('title'))
            cSlot.find('img[cat=icon]').attr("src", $(this).find('img').attr('src'))
            cSlot.find('p[cat=extra]').attr("category", $(this).attr('category'))
            cSlot.addClass('categoryShortcut').attr('category', $(this).attr('category'))
            $('#serverInfo').append(cSlot)
        })
        
        // on category change
        $('.category').on("click keydown", function(e) {
            if (ignoreTabPress(e)) return
            $('.current').removeClass('current')
            $(this).addClass('current')
            $('.configboxes').hide()
            $(`.configboxes[tab="${$(this).attr('category')}"]`).show()
            $('.hideOnLoad').hide()
        })
        $('.category[category="server"]').trigger('click') // default category

        $('.categoryShortcut').on("click keydown", function(e) {
            if (ignoreTabPress(e)) return
            $(`.category[category="${$(this).attr('category')}"]`).trigger('click')
        })

        // extra info on home
        updateHomeInfo = function(data) {
            $('p[cat="extra"][category="xp"]').text(data.enabled ? `Enabled! ${commafy(data["gain.min"])}${data["gain.min"] == data["gain.max"] ? "" : `-${commafy(data["gain.max"])}`} XP every ${commafy(data["gain.time"])}s` : "XP disabled!").css("color", data.enabled ? "var(--polarisgreen)" : "#ff6666")
            $('p[cat="extra"][category="rewardroles"]').text(data.rewards.length ? addS(data.rewards.length, "reward role") : "No reward roles")
            $('p[cat="extra"][category="levelup"]').text(data["levelUp.enabled"] && data["levelUp.message"] ? `Enabled!${data["levelUp.embed"] ? " (embedded)" : ""}` : "Disabled")
            $('p[cat="extra"][category="multipliers"]').text(`${addS(data["multipliers.roles"].length, "role")}, ${addS(data["multipliers.channels"].length, "channel")}`)
            $('p[cat="extra"][category="rankcard"]').text(`${data["rankCard.disabled"] ? "Disabled" : data["rankCard.ephemeral"] ? "Invisible" : "Enabled!"}`)
            $('p[cat="extra"][category="leaderboard"]').text(`${data["leaderboard.disabled"] ? "Disabled" : data["leaderboard.private"] ? "Private" : "Enabled!"}${data["leaderboard.maxEntries"] ? ` (max ${commafy(data["leaderboard.maxEntries"])})` : ""}`)
            $('p[cat="extra"][category="data"]').text(`Last saved: ${lastUpdated ? `${new Date(lastUpdated).toLocaleString([], {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'})}` : "Never"}`)
            $('#mainlbbutton').toggle(!data['leaderboard.disabled'])
        }

        // multipliers
        let roleMultipliers = db.multipliers.roles
        let channelMultipliers = db.multipliers.channels

        // reward role table
        let rewards = db.rewards
        rewards.forEach(x => { if (!x.noSync) x.noSync = false }) // undefined -> false

        function buildRewardTable() {
            let excludeEnabled = $('#excludeRewardToggle').prop('checked')
            rewards = rewards.sort((a, b) => a.level - b.level)
            $('#rewards').html(`
                <div col="lvl" style="width: 100px"><p><b>Level</b></p></div>
                <div col="role" style="width: 400px"><p><b>Role</b></p></div>
                <div col="keep" style="width: 100px"><p><b>Keep</b></p></div>
                <div col="exclude" style="width: 100px${!excludeEnabled ? "; display: none" : ""}"><p><b>Sync</b></p></div>
                <div col="delete" style="width: 80px"><p><b>Delete</b></p></div>
            `)

            rewards.forEach(reward => {
                let foundRole = data.roles.find(x => x.id == reward.id)
                if (!foundRole) return
                else $(`#rewardRoleSelect option[value=${reward.id}]`).prop('hidden', true)

                $('#rewards div[col="lvl"]').append(`<p class="rewardLevel numberinput" tabindex="-1" roleID="${reward.id}" min="1" max="1000" default="10" contenteditable>${reward.level}</p>`)
                $('#rewards div[col="role"]').append(`<p class="longname" style="color: ${foundRole.color == "#000000" ? "var(--defaultrolecol)" : foundRole.color}">${foundRole.name}</p>`)
                $('#rewards div[col="keep"]').append(`<p class="toggleRow" tr="keep" tabindex="0" roleID="${reward.id}" style="color: ${reward.keep ? "lime" : "nah"}">${reward.keep ? "Yes" : "No"}${reward.noSync && !excludeEnabled ? "*" : ""}</p>`)
                $('#rewards div[col="exclude"]').append(`<p class="toggleRow" tr="noSync" tabindex="0" roleID="${reward.id}" style="color: ${reward.noSync ? "red" : "lime"}">${reward.noSync ? "No" : "Yes"}</p>`)
                $('#rewards div[col="delete"]').append(`<p class="deleteRow deleteReward" tabindex="0" roleID="${reward.id}">🗑️</p>`)
            })
            $('#rewardCount').html(rewards.length)
            checkUnsavedChanges()
        }

        // role selector appending (hacky but whatever, screw frontend stuff)
        function appendRoleSelect(element, roleOption, role, onlyGrantable, hideCondition) {
            let option = roleOption.clone()
            let roleSelect = $(element)
            if (hideCondition) option.prop("hidden", true)
            if (!roleSelect.children().length) roleSelect.append("<option value='none' selected disabled>(role)</option>")

            if (onlyGrantable && !role.grantable) {
                if (option.val() == data.guild.id) return
                option.css("color", "")
                option.prop("disabled", true)
                option.html(option.html() + " -- too high to grant!")
            }

            return roleSelect.append(option)
        }

        // role selectors
        data.roles.forEach(x => {
            let roleOption = $(`<option value="${x.id}">${x.name}</option>`)
            roleOption.css("color", x.color == "#000000" ? "var(--defaultrolecol)" : x.color)

            if (!x.managed) appendRoleSelect('#rewardRoleSelect', roleOption, x, true, rewards.some(r => r.id == x.id))
            appendRoleSelect('#roleMultiplierSelect', roleOption, x, false, roleMultipliers.some(r => r.id == x.id))
        })

        let channelPrefixes = { channel: "#", category: "&gt; ", vc: "🔊 ", thread: "└─ ", forum: "💬 "}
        let chMultiplierChannels = data.channels.map(x => `<option ${x.type == "category" ? `style="font-weight: bold"` : ""} value="${x.id}">${channelPrefixes[x.type] || "* "}${x.name}</option>`)
        $('#channelMultiplierSelect').append("<option value='none' selected disabled>(channel)</option>").append(chMultiplierChannels)


        // add new reward role
        $('#addRewardRole').click(function() {
            let roleID = $('#rewardRoleSelect').val()
            let level = Math.round($('#rewardLevel').val())
            let keep = !$('#rewardKeep').prop('checked')
            let noSync = $('#rewardExclude').prop('checked')

            if (!data.roles.some(x => x.id == roleID) || rewards.some(x => x.id == roleID) || !level || level <= 0 || level > 1000) return
            else rewards.push({ id: roleID, level, keep, noSync })
            $('#rewardRoleSelect').val("none")
            buildRewardTable()
        })

        $('#rewardRoleSelect').change(function() {
            let selected = $(this).find(":selected").text()
            let foundNumber = selected.match(/[0-9.]+/)
            if (foundNumber && !foundNumber[0].includes(".")) {
                let num = Number(foundNumber[0])
                if (num > 0 && num <= 1000) $('#rewardLevel').val(num)
            }
        })

        // reward role - swap keep
        $(document).on('click keydown', '.toggleRow', function(e) {
            if (ignoreTabPress(e)) return
            let tr = $(this).attr("tr")
            let foundReward = rewards.find(x => x.id == $(this).attr("roleID"))
            if (foundReward) foundReward[tr] = !foundReward[tr]
            buildRewardTable()
        })

        // reward role - delete
        $(document).on('click keydown', '.deleteReward', function(e) {
            if (ignoreTabPress(e)) return
            let foundReward = rewards.find(x => x.id == $(this).attr("roleID"))
            if (foundReward) rewards = rewards.filter(x => x.id != foundReward.id)
            $(`#rewardRoleSelect option[value=${foundReward.id}]`).prop('hidden', false)
            buildRewardTable()
        })

        // reward role - edit level
        $(document).on('blur', '.rewardLevel', function() {
            let foundReward = rewards.find(x => x.id == $(this).attr("roleID"))
            if (!foundReward) return
            let newVal = Math.round($(this).text())
            if (newVal != foundReward.level && newVal > 0 && newVal <= 1000) foundReward.level = newVal
            buildRewardTable()
        })

        // reward role - toggle excuded
        $('#excludeRewardToggle').click(function() {
            let checked = $(this).prop('checked')
            window.scrollTo({top: 0, behavior: 'smooth'});
            if (checked) $('.excludeMode').show()
            else $('.excludeMode').hide()
            buildRewardTable()
        })
        if (rewards.some(x => x.noSync)) $('#excludeRewardToggle').prop('checked', true)
        else $('.excludeMode').hide()

        // show curve difficulty
        function displayCurveDifficulty(curve, difficultyText) {
            let diffRating = Number(getCurveDifficulty(curve).toFixed(2))
            let ratingKeys = Object.entries(data.curvePresets.difficultyRatings).reverse()
            return difficultyText.text(`${commafy(diffRating)} (${ratingKeys.find(x => +x[0] <= diffRating)[1]})`)
        }

        // multiplier role table
        function buildRoleMultiplerTable() {
            roleMultipliers = roleMultipliers.sort((a, b) => a.boost - b.boost)
            $('#roleMultipliers').html(`
                <div col="boost" style="width: 140px"><p><b>Multiplier</b></p></div>
                <div col="role" style="width: 380px"><p><b>Role</b></p></div>
                <div col="delete" style="width: 80px"><p><b>Delete</b></p></div>
            `)

            roleMultipliers.forEach(boost => {
                let foundRole = data.roles.find(x => x.id == boost.id)
                if (!foundRole) return
                else $(`#roleMultiplierSelect option[value=${boost.id}]`).prop('hidden', true)

                $('#roleMultipliers div[col="boost"]').append(`<p class="roleMultiplierAmount numberinput" roleID="${boost.id}" min="0" max="100" decimals="4" default="1" tabindex="-1" contenteditable>${+boost.boost}x</p>`)
                $('#roleMultipliers div[col="role"]').append(`<p class="longname" style="color: ${foundRole.color == "#000000" ? "var(--defaultrolecol)" : foundRole.color}">${foundRole.name}</p>`)
                $('#roleMultipliers div[col="delete"]').append(`<p class="deleteRow deleteRoleMultiplier" tabindex="0" roleID="${boost.id}">🗑️</p>`)
            })
            $('#roleMultiplierCount').html(roleMultipliers.length)
            checkUnsavedChanges()
        }

        // add new multiplier role
        $('#addRoleMultiplier').click(function() {
            let roleID = $('#roleMultiplierSelect').val()
            let boost = Number(Number($('#roleMultiplierAmount').val()).toFixed(2))

            if (isNaN(boost) || !$('#roleMultiplierAmount').val() || !data.roles.some(x => x.id == roleID) || roleMultipliers.some(x => x.id == roleID) || boost < 0 || boost > 100) return
            else roleMultipliers.push({ id: roleID, boost: boost })
            $('#roleMultiplierSelect').val("none")
            buildRoleMultiplerTable()
        })

        // multiplier role - delete
        $(document).on('click keydown', '.deleteRoleMultiplier', function(e) {
            if (ignoreTabPress(e)) return
            let foundReward = roleMultipliers.find(x => x.id == $(this).attr("roleID"))
            if (foundReward) roleMultipliers = roleMultipliers.filter(x => x.id != foundReward.id)
            $(`#roleMultiplierSelect option[value=${foundReward.id}]`).prop('hidden', false)
            buildRoleMultiplerTable()
        })
        
        // multiplier role - edit amount
            $(document).on('blur', '.roleMultiplierAmount', function() {
            let foundMultiplier = roleMultipliers.find(x => x.id == $(this).attr("roleID"))
            let newBoost = Number(Number($(this).text()).toFixed(2))
            if (foundMultiplier && !isNaN(newBoost) && newBoost >= 0 && newBoost <= 100) foundMultiplier.boost = newBoost
            buildRoleMultiplerTable()
        })

        // multiplier s - remove X when editing amount
                $(document).on('focus', '.roleMultiplierAmount, .channelMultiplierAmount', function() {
            $(this).html($(this).html().replace("x", ""))
        })


        // welcome to downtown copypasteville
        // multiplier channel table
        function buildChannelMultiplierTable() {
            channelMultipliers = channelMultipliers.filter(x => data.channels.some(c => c.id == x.id))
            .sort((a, b) => data.channels.findIndex(c => c.id == a.id) - data.channels.findIndex(c => c.id == b.id))

            $('#channelMultipliers').html(`
                <div col="boost" style="width: 140px"><p><b>Multiplier</b></p></div>
                <div col="channel" style="width: 380px"><p><b>Channel</b></p></div>
                <div col="delete" style="width: 80px"><p><b>Delete</b></p></div>
            `)

            channelMultipliers.forEach(boost => {
                let foundChannel = data.channels.find(x => x.id == boost.id)
                if (!foundChannel) return
                else $(`#channelMultiplierSelect option[value=${boost.id}]`).prop('hidden', true)

                $('#channelMultipliers div[col="boost"]').append(`<p class="channelMultiplierAmount numberinput" channelID="${boost.id}" min="0" max="100" decimals="4" default="1" tabindex="-1" contenteditable>${+boost.boost}x</p>`)
                $('#channelMultipliers div[col="channel"]').append(`<p class="longname">${channelPrefixes[foundChannel.type] || "* "}${foundChannel.name}</p>`)
                $('#channelMultipliers div[col="delete"]').append(`<p class="deleteRow deleteChannelMultiplier" tabindex="0" channelID="${boost.id}">🗑️</p>`)
            })
            $('#channelMultiplierCount').html(channelMultipliers.length)
            checkUnsavedChanges()
        }

        // add new multiplier channel
        $('#addChannelMultiplier').click(function() {
            let channelID = $('#channelMultiplierSelect').val()
            let boost = Number(Number($('#channelMultiplierAmount').val()).toFixed(2))

            if (isNaN(boost) || !$('#channelMultiplierAmount').val() || !data.channels.some(x => x.id == channelID) || channelMultipliers.some(x => x.id == channelID) || boost < 0 || boost > 100) return
            else channelMultipliers.push({ id: channelID, boost: boost })
            $('#channelMultiplierSelect').val("none")
            buildChannelMultiplierTable()
        })

        // multiplier channel - delete
        $(document).on('click', '.deleteChannelMultiplier', function() {
            let foundReward = channelMultipliers.find(x => x.id == $(this).attr("channelID"))
            if (foundReward) channelMultipliers = channelMultipliers.filter(x => x.id != foundReward.id)
            $(`#channelMultiplierSelect option[value=${foundReward.id}]`).prop('hidden', false)
            buildChannelMultiplierTable()
        })
        
        // multiplier channel - edit amount
            $(document).on('blur', '.channelMultiplierAmount', function() {
            let foundMultiplier = channelMultipliers.find(x => x.id == $(this).attr("channelID"))
            let newBoost = Number(Number($(this).text()).toFixed(2))
            if (foundMultiplier && !isNaN(newBoost) && newBoost >= 0 && newBoost <= 100) foundMultiplier.boost = newBoost
            buildChannelMultiplierTable()
        })


        // level up message channel
        $("#lvlMessageSelect").append(data.channels.filter(x => x.type == "channel").map(x => `<option value="${x.id}">#${x.name}</option>`))
        $("#lvlMessageSelect").val(db.levelUp.channel)
        if (!$("#lvlMessageSelect").val()) $("#lvlMessageSelect").val("current")

        if (!db.levelUp.enabled) $('.ifmessageenabled').hide()
        if (db.leaderboard.disabled) $('.iflbenabled').hide()
        if (db.rankCard.disabled) $('.ifrankenabled').hide()

        if (db.levelUp.embed) {
            $('#regularMessage').hide()
            $('#embedMessage').show()
            $('#lvlUpMessage').addClass('inactiveSave')
            $('#lvlUpEmbed').removeClass('inactiveSave')
            $('#lvlUpEmbed').text(db.levelUp.message)
        }

        else {
            $('#regularMessage').show()
            $('#embedMessage').hide()
            $('#lvlUpEmbed').addClass('inactiveSave')
            $('#lvlUpMessage').removeClass('inactiveSave')
            $('#lvlUpMessage').text(db.levelUp.message)
        }

        $('#toggleLvlUpEmbed').click(function() {
            $('#regularMessage').toggle()
            $('#embedMessage').toggle()
            $('#lvlUpMessage, #lvlUpEmbed').toggleClass('inactiveSave')
        })

        $('#lvlUpEmbed').on("change blur", function() {
            if ($(this).val().trim().length < 1) {
                $(this).val("")
                return $('#invalidLevelUpEmbed').hide()
            }
            else if (validateEmbedJSON()) $('#invalidLevelUpEmbed').hide()
            else $('#invalidLevelUpEmbed').show()
        })

        $('#lvlUpMessageVariables select').change(function() {
            let text = $(this).val()
            let textbox = $('.lvlTextbox:visible')
            $(this).val("x")
            if (!textbox.length) return

            let cursor = textbox[0].selectionStart;
            textbox.val(textbox.val().slice(0, cursor) + text + textbox.val().slice(cursor))
            textbox.focus();
            textbox[0].selectionStart = textbox[0].selectionEnd = cursor + text.length; 
        })

        $('.multiplierSelect').change(function() {
            let mType = $(this).attr('desc')
            let desc = multiplierDescriptions[mType][$(this).val()] || "i am error"
            $(`#${mType}MultiplierDescription`).text(desc)
        })
        $('.multiplierSelect').trigger('change')

        $('.colInputPreview').on("click keydown", function(e) {
            if (ignoreTabPress(e)) return
            $(`#${$(this).attr("for")}`).trigger("click")
        })

        $('.previewColorInput').on("input blur", function() {
            let id = $(this).attr("id")
            $(`.colInputPreview[for="${id}"]`).css("background-color", $(this).val())
            $(`.colorInput[for="${id}"]`).val($(this).val())
        })

        $('.colorInput').on("input blur", function(e) {
            let colFor = $(this).attr("for")
            let val = $(this).val().replace("#", "")
            if (val.match(/^[0-9a-fA-F]{6}$/)) {
                $(`#${colFor}`).val("#" + val)
                $(`.colInputPreview[for="${colFor}"]`).css("background-color", "#" + val)
            }
            if (e.type == "blur") { $(`#${colFor}`).trigger("blur"); checkUnsavedChanges() }
        })

        function toggleEmbedColorDiv(val, name, slider) {
            if (val == -1) return
            $(`#${slider}`).prop("checked", true)
            $(`#${name}Config`).show()
            $(`#${name}`).val("#" + val.toString(16)).trigger("input")
        }

        toggleEmbedColorDiv(db.rankCard.embedColor, "customEmbedColRank", "useCustomEmbedColRank")
        toggleEmbedColorDiv(db.leaderboard.embedColor, "customEmbedColTop", "useCustomEmbedColTop")
        
        $('.leaderboardLink').attr("href", "/leaderboard/" + data.guild.id)

        if (data.guild.botDev) $('.forDevs').removeAttr('disabled')

        generateSaveJSON = function() {
            let settings = { rewards, "multipliers.roles": roleMultipliers, "multipliers.channels": channelMultipliers }

            $("[saveName]:not(.inactiveSave)").each(function() {
                let x = $(this)
                let node = x.prop("nodeName")
                let property = x.attr("saveName")
                if (property == "db") property = x.attr("db")
                let val = x.val()

                switch(node) {

                    case "INPUT": case "TEXTAREA":
                        let aType = x.attr("type")
                        if (aType == "number") settings[property] = +val
                        else if (aType == "checkbox") settings[property] = x.attr("invert") ? !x.prop("checked") : x.prop("checked")
                        else if (aType == "color") {
                            if (x.attr("useif") && !$('#' + x.attr("useif")).prop("checked")) settings[property] = -1
                            else settings[property] = parseInt(val.replace("#", ""), 16)
                        }
                        else settings[property] = val
                        break

                    default:
                        settings[property] = val
                        
                }
            })

            return settings
    }

    buildRewardTable()
    buildRoleMultiplerTable()
    buildChannelMultiplierTable()

    let defaultData = generateSaveJSON()
    updateHomeInfo(defaultData)
    lastSavedData = JSON.stringify(defaultData)

    $('#everything').show()
    $('#loading').hide()

    }).catch((e) => {
        console.error(e)
        $('#errorheader').css('margin-top', '70px')
        if (e.apiError) switch (e.code) {
            case "noPerms":
                $('#errorheader').text("No permission!")
                $('#errorfooter').text("You don't have permission to manage this server.")
                break;

            case "login":
                $('#errorheader').text("Not logged in!")
                $('#errorfooter').text("Please log in to manage this server.")
                $('#loginbutton').show()
                break;

            default:
                $('#errorfooter').text(e.message)
                break;
        }

        else {
            $('#errorfooter').text(e.message)
            $('#errorhelp').show()
        }
        
        $('#loading').hide()
        $('#uhoh').show()
    })

    let lastSavedData;

    // need these to be global, excellent programming i know
    let generateSaveJSON = function() { return {} }
    let updateHomeInfo = function() { return {} }

    function addS(amount, str) {
        return `${commafy(amount)} ${str}${amount == 1 ? "" : "s"}`
    }

    this.commafy = function(num, locale="en-US") {
            return num.toLocaleString(locale, { maximumFractionDigits: 10 })
        }

    function commafy(num, locale="en-US") {
        return num.toLocaleString(locale, { maximumFractionDigits: 10 })
    }

    function getXPForLevel(level, curve, rounding) {
        let xpRequired = Object.entries(curve).reduce((total, n) => total + (n[1] * (level ** n[0])), 0)
        return rounding > 1 ? rounding * Math.round(xpRequired / rounding) : xpRequired
    }

    function getAvgMessagesRequired(min, max, xp) {
        return Math.round([min, max].map(x => xp / x).reduce((a, b) => a + b, 0) / 2)
    }

    function getCurveDifficulty(curve, levelTest=75) {
        let second_derivative = (6 * curve[3] * levelTest) + (2 * curve[2])
        return second_derivative
    }

    // for focused elements - ignore unless pressing space or enter
    function ignoreTabPress(e) {
        return (e.type == "keydown" && ![32, 13].includes(e.keyCode))
    }

    // check if unsaved changes were made
    function hasUnsavedChanges() { 
        return lastSavedData != JSON.stringify(generateSaveJSON())
    }

    // generate save json but only the values that actually changed
    function compareSaveJSON() {
        let lastSaved = JSON.parse(lastSavedData)
        let currentSaved = generateSaveJSON()
        let diff = {}
        Object.keys(currentSaved).forEach(k => {
            if (JSON.stringify(currentSaved[k]) != JSON.stringify(lastSaved[k])) diff[k] = currentSaved[k]
        })
        return diff
    }

    // show popup if there's unsaved changes
    function checkUnsavedChanges() {
        if (!lastSavedData) return
        if (hasUnsavedChanges()) $('#unsavedWarning').addClass('activeWarning')
        else $('#unsavedWarning').removeClass('activeWarning')
    }

    function validateEmbedJSON() {
        try { 
            let jsonTest = JSON.parse($('#lvlUpEmbed').val()).embeds[0]
            if (Array.isArray(jsonTest) || typeof jsonTest != "object") return false
            else return true
        }
        catch(e) { return false }
    }

    $('[saveName]').change(checkUnsavedChanges)

    $(document).on("input blur", 'input[type=number], .numberinput', function(e) {
        
        let isInput = e.target.nodeName == "INPUT"
        let rawVal = isInput ? $(this).val() : $(this).text()
        let val = Number(rawVal)
        let min = Number($(this).attr('min'))
        let max = Number($(this).attr('max'))
        let dec = Number($(this).attr('decimals') || 0)
        let def = Number($(this).attr('default'))
        let cleanVal = val

        if (!rawVal.length) cleanVal = isNaN(def) ? "" : def
        else if (!isNaN(min) && val < min) cleanVal = min
        else if (!isNaN(max) && val > max) cleanVal = max 

        if (e.type == "input" && cleanVal != val) $(this).addClass('red')
        else $(this).removeClass('red')

        if (e.type != "input") {
            if (isNaN(def) && cleanVal === "") return
            let rounded = +cleanVal.toFixed(dec)
            isInput ? $(this).val(rounded) : $(this).text(rounded)
        }
    })

    $(document).on("input blur", 'input[type=checkbox][linked]', function(e) {
        let link = $(this).attr('linked')
        let checked = $(this).prop('checked')
        $(`input[type=checkbox][linked=${link}]`).prop('checked', false)
        if (checked) $(this).prop('checked', true)
    })


    let requestInProgress = false

    $('#saveChanges').click(function() {
        if (requestInProgress || $('#unsavedWarning.activeWarning').length < 1) return
        let lvlEmbedEnabled = $('#toggleLvlUpEmbed').prop('checked')
        if (lvlEmbedEnabled && !validateEmbedJSON()) return alert("Invalid level up embed data! Please fix it or remove it before saving.")
        else requestInProgress = true
        $('#saveChanges').html("...")
        let savejson = compareSaveJSON()
        if (savejson["levelUp.message"] && !savejson["levelUp.embed"]) savejson["levelUp.embed"] = lvlEmbedEnabled
        $.ajax({
            url: "/api/settings", type: "post",
            data: JSON.stringify(Object.assign(savejson, {guildID})),
            headers: { 'Content-Type': 'application/json'}
        })
        .done(function(res) {
            requestInProgress = false
            $('#saveChanges').html("Save")
            let newSave = generateSaveJSON()
            lastUpdated = Date.now()
            updateHomeInfo(newSave)
            lastSavedData = JSON.stringify(newSave)
            $('#unsavedWarning').removeClass('activeWarning')
        })
        .fail(function (e) {
            requestInProgress = false
            $('#saveChanges').html("Save")
            alert(`Error! ${e.responseText}`);
            console.error(e)
        })
    })

    $('#resetSettings').click(function() {
        if (requestInProgress) return
        else if (!confirm("Last chance! Are you sure you want to reset all settings?")) return
        requestInProgress = true
        $.ajax({
            url: "/api/settings", type: "post",
            data: JSON.stringify({guildID, resetSettings: true}),
            headers: { 'Content-Type': 'application/json'}
        })
        .done(function(res) {
            requestInProgress = false
            window.location.reload()
        })
        .fail(function (e) {
            requestInProgress = false
            alert(`Error! ${e.responseText}`);
            console.error(e)
        })
    })

    $('#resetXP').click(function() {
        if (requestInProgress) return
        else if (!confirm("This is seriously your last chance!!! Reset everyone's XP?")) return
        requestInProgress = true
        $.ajax({
            url: "/api/settings", type: "post",
            data: JSON.stringify({guildID, resetXP: true}),
            headers: { 'Content-Type': 'application/json'}
        })
        .done(function(res) {
            requestInProgress = false
            alert("All XP has been reset!")
            $('.confirmReset').hide()
            $('.confirmConfirmReset').hide()
        })
        .fail(function (e) {
            requestInProgress = false
            alert(`Error! ${e.responseText}`);
            console.error(e)
        })
    })

    $('.exportXP').click(function() {
        if (requestInProgress) return
        else requestInProgress = true
        let format = $(this).attr("format")

        fetch(`/api/xp/${guildID}?format=${format}`).then(res => {
            if (!res.ok) {
                requestInProgress = false
                return res.json().then(e => { alert(`Error! ${e.message}`); }).catch(() => { alert("Error!") })
            }
            requestInProgress = false
            res.blob().then(blob => {
                let downloader = document.createElement('a');
                downloader.href = URL.createObjectURL(blob)
                downloader.dataset.downloadurl = ['text/txt', downloader.download, downloader.href].join(':');
                downloader.style.display = "none"; downloader.download = `${serverName}.${format == "everything" ? "json" : format}`
                downloader.target = "_blank"; document.body.appendChild(downloader);
                downloader.click(); document.body.removeChild(downloader);
            })
        }).catch((e) => {
            requestInProgress = false
            alert(`Error! ${e.responseText}`);
            console.error(e)
        })
    })

    $('#sendExample').click(function() {
        if (requestInProgress) return

        let exampleLevel = Number($('#exampleLevel').val())
        let saveData = generateSaveJSON()
        let embedMode = saveData['levelUp.embed']
        if (embedMode && !validateEmbedJSON()) return alert("Invalid level up embed data! Please fix it or remove it before testing.")
        else if (!saveData['levelUp.message']) return
        else requestInProgress = true
        
        $('.exampleP').hide()
        $('#sendingExample').show()

        $('#sendExample').prop('disabled', true)
        $.ajax({
            url: "/api/sendexample", type: "post",
            data: JSON.stringify({guildID, embed: embedMode, level: exampleLevel || undefined, message: saveData['levelUp.message']}),
            headers: { 'Content-Type': 'application/json'}
        })
        .done(function(res) {
            requestInProgress = false
            setTimeout(() => { $('#sendExample').prop('disabled', false) }, 3000);
            $('#sendingExample').hide()
            $('#exampleSent').show()
        })
        .fail(function (e) {
            requestInProgress = false
            setTimeout(() => { $('#sendExample').prop('disabled', false) }, 3000);
            $('#sendingExample').hide()
            $('#exampleError').show()
            console.error(e)
        })
    })

    $('#confirmPrune').click(function() {
        if (requestInProgress) return
        let amt = Number($('#prune_amt').val())
        if (amt <= 0) return

        $('#confirmPrune').prop('disabled', true)

        requestInProgress = true

        $.ajax({
            url: "/api/pruneMembers", type: "post",
            data: JSON.stringify({guildID, amount: amt}),
            headers: { 'Content-Type': 'application/json'}
        })
        .done(function(res) {
            requestInProgress = false
            setTimeout(() => { $('#confirmPrune').prop('disabled', false) }, 1000);

            if (res.matches < 1) return alert(`Nobody in your server has less than ${amt} XP!`)

            if (confirm(`Are you sure you want to prune? This will wipe ${commafy(res.matches)} user${res.matches == 1 ? "" : "s"}, leaving ${commafy(res.total - res.matches)} left.`)) {
                
                requestInProgress = true

                $.ajax({
                    url: "/api/pruneMembers", type: "post",
                    data: JSON.stringify({guildID, amount: amt, confirmPrune: "hell yes"}),
                    headers: { 'Content-Type': 'application/json'}
                })
                .done(function(res) {
                    requestInProgress = false
                    return alert(res)
                })
                .fail(function (e) {
                    requestInProgress = false
                    alert("Something went wrong while trying to prune!\n" + e.message)
                    console.error(e)
                })

            }
        })
        .fail(function (e) {
            requestInProgress = false
            setTimeout(() => { $('#confirmPrune').prop('disabled', false) }, 1000);
            alert("Something went wrong checking the prune count!\n" + e.message)
            console.error(e)
        })
    })

    function readJSONFile(file) {
        return new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const parsed = JSON.parse(reader.result)
                    res(parsed)
                }
                catch(e) { rej(e) }
            }
            reader.onerror = () => rej(reader.error)
            reader.readAsText(file)
        })
    }

    let failedImports = []
    $('#confirmBotImport').click(async function() {
        if (requestInProgress) return

        if (hasUnsavedChanges()) return alert("Please save your unsaved changes first!")

        let botName = $('#importfrom').find(":selected").text().split("(")[0].trim()
        let importBot = $('#importfrom').val()
        let importGroup = $(`.importdiv[importtype='${importBot}']`)

        let jsonData;
        if (importBot == "json") {
            let jsonfile = $('#importJSONFile').prop('files')[0]
            if (!jsonfile) return alert("No .json file has been uploaded!")
            jsonData = await readJSONFile(jsonfile).catch(() => null)
            if (!jsonData) return alert("Could not parse that file! Are you sure it's a valid .json file?")
            if (Array.isArray(jsonData) && jsonData[0] && jsonData[0].xp && !confirm("This .json file only contains XP data - no settings will be modified. Are you cool with that?")) return
        }

        if (!importGroup.length) return alert("Invalid bot??!")
        if (failedImports.includes(importBot)) return alert(`You already tried to import from ${botName}, and it failed! Please wait 30 seconds since the last attempt before trying again.`)

        let importSettings = { bot: importBot }
        importGroup.find('.importSetting').each(function() {
            importSettings[$(this).attr("option")] = $(this).attr("type") == "checkbox" ? $(this).prop("checked") : $(this).val()
        })

        if (!importSettings.xp && (!importSettings.settings && !importSettings.rewardroles)) return alert("Please import either XP or settings!")

        requestInProgress = true
        $('#botimporting').hide()
        $('#botimportloading').show()

        const importData = {guildID, import: importSettings}
        if (jsonData) importData.jsonData = jsonData

        $.ajax({
            url: "/api/importfrombot", type: "post",
            data: JSON.stringify(importData),
            headers: { 'Content-Type': 'application/json'}
        })
        .done(function(res) {
            $('#botimportloading').hide()
            alert(res)
            window.location.reload()
        })
        .fail(function (e) {
            $('#botimporting').show()
            $('#botimportloading').hide()
            requestInProgress = false
            if (e.responseJSON && e.responseJSON.apiError) {
                let isJSON = (importBot == "json")
                if (e.responseJSON.code == "noData") alert(isJSON ? "No server or XP data was found!" : "This server doesn't have any data!")
                else alert("Error while trying to import data!\n" + e.responseJSON.message)  
                if (e.responseJSON.code != "importCooldown" && e.responseJSON.code != "invalidImport") {
                    if (!isJSON) failedImports.push(importBot)
                    setTimeout(() => {
                        failedImports = failedImports.filter(x => x != importBot)
                    }, 30 * 1000);
                }
            }
            else {
                alert("Error while trying to import data!\n" + e.message)  
            }
            console.error(e)
        })
    })