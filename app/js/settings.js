addUhOh()
    let i18n = window.i18nConfig || {}; // Fallback

    let guildID = window.location.pathname.split("/").pop().split("-")[0]
    let serverName = guildID
    let lastUpdated = 0

    const multiplierDescriptions = {
        role: {
            largest: i18n.mult_role_largest,
            smallest: i18n.mult_role_smallest,
            highest: i18n.mult_role_highest,
            add: i18n.mult_role_add,
            combine: i18n.mult_role_combine
        },

        channel: {
            multiply: i18n.mult_chan_multiply,
            add: i18n.mult_chan_add,
            largest: i18n.mult_chan_largest,
            channel: i18n.mult_chan_channel,
            role: i18n.mult_chan_role
        }
    }

    Fetch(`/api/settings/${guildID}`).then(data => {

        console.log(data)

        let db = data.settings
        serverName = data.guild.name
        document.title = i18n.settings_for + serverName
        lastUpdated = data.guild.lastUpdate || 0

        // curve graph ft. desmos
        let desmosConfig = {
            fontSize: 14,
            expressions: false,
            invertedColors: true,
            advancedStyling: true,
            restrictGridToFirstQuadrant: true,
            xAxisLabel: i18n.axis_level,
            yAxisLabel: i18n.axis_xp,
            backgroundColor: "#151e2f",
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
        else $('#desmosJumpscare').removeAttr("style").text(i18n.desmos_fail)

        $('.serverName').text(data.guild.name)
        $('.serverMembers').text(commafy(data.guild.members || "?") + " " + (data.guild.members == 1 ? i18n.member : i18n.members))
        $('.serverIcon').attr('src', data.guild.icon || "/assets/avatar.png")
        $('#otherServers').append(data.ownedServers.map(x => `<option value="${x.id}">${escapeHTML(x.name)}</option>`))
        
        // fill in inputs with current values
        $('input[db], select[db]').each(function() {
            let dbKey = $(this).attr('db').split('.')
            let dbVal = db
            while (dbKey.length) {
                if (dbVal === undefined) break;
                dbVal = dbVal[dbKey.shift()];
            }
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
            "desc": i18n.custom_settings_desc,
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
            if (typeof lucide !== 'undefined') lucide.createIcons();
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
                {name: i18n.table_level, id: "level"},
                {name: i18n.table_xp, id: "xp", extra: true},
                {name: i18n.table_msgs, id: "msgs", extra: true},
                {name: i18n.table_time, id: "time", extra: true},
                {name: i18n.table_total_xp, id: "cum_xp"},
                {name: i18n.table_total_msgs, id: "cum_msgs"},
                {name: i18n.table_total_time, id: "cum_time"}
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
                desmosGraph.setExpression({ id: 'xp', color: "#43dada", latex: `y = ${curve[3]}x^3 + ${curve[2]}x^2 + ${curve[1]}x \\{x>=0\\}` })
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

            let iconElement = $(this).find('img, svg, i').first().clone();
            cSlot.find('.icon-container').empty().append(iconElement);
            
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
            $('p[cat="extra"][category="xp"]').text(data.enabled ? `${i18n.enabled} ${commafy(data["gain.min"])}${data["gain.min"] == data["gain.max"] ? "" : `-${commafy(data["gain.max"])}`} ${i18n.xp_every} ${commafy(data["gain.time"])}s` : i18n.xp_disabled).css("color", data.enabled ? "var(--polarisgreen)" : "#ff6666")
            $('p[cat="extra"][category="rewardroles"]').text(data.rewards.length ? addS(data.rewards.length, i18n.reward_role) : i18n.no_reward_roles)
            $('p[cat="extra"][category="levelup"]').text(data["levelUp.enabled"] && data["levelUp.message"] ? `${i18n.enabled}${data["levelUp.embed"] ? " " + i18n.embedded : ""}` : i18n.disabled)
            $('p[cat="extra"][category="multipliers"]').text(`${addS(data["multipliers.roles"].length, i18n.role)}, ${addS(data["multipliers.channels"].length, i18n.channel)}`)
            $('p[cat="extra"][category="rankcard"]').text(`${data["rankCard.disabled"] ? i18n.disabled : data["rankCard.ephemeral"] ? i18n.invisible : i18n.enabled}`)
            $('p[cat="extra"][category="leaderboard"]').text(`${data["leaderboard.disabled"] ? i18n.disabled : data["leaderboard.private"] ? i18n.private : i18n.enabled}${data["leaderboard.maxEntries"] ? ` (${i18n.max} ${commafy(data["leaderboard.maxEntries"])})` : ""}`)
            $('p[cat="extra"][category="data"]').text(`${i18n.last_saved} ${lastUpdated ? `${new Date(lastUpdated).toLocaleString([], {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'})}` : i18n.never}`)
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
                <div col="lvl" style="width: 100px"><p><b>${i18n.table_level}</b></p></div>
                <div col="role" style="width: 400px"><p><b>${i18n.table_role}</b></p></div>
                <div col="keep" style="width: 100px"><p><b>${i18n.table_keep}</b></p></div>
                <div col="exclude" style="width: 100px${!excludeEnabled ? "; display: none" : ""}"><p><b>${i18n.table_sync}</b></p></div>
                <div col="delete" style="width: 80px"><p><b>${i18n.table_delete}</b></p></div>
            `)

            rewards.forEach(reward => {
                let foundRole = data.roles.find(x => x.id == reward.id)
                if (!foundRole) return
                else $(`#rewardRoleSelect option[value=${reward.id}]`).prop('hidden', true)

                $('#rewards div[col="lvl"]').append(`<p class="rewardLevel numberinput" tabindex="-1" roleID="${reward.id}" min="1" max="1000" default="10" contenteditable>${reward.level}</p>`)
                $('#rewards div[col="role"]').append(`<p class="longname" style="color: ${foundRole.color == "#000000" ? "var(--defaultrolecol)" : foundRole.color}">${escapeHTML(foundRole.name)}</p>`)
                $('#rewards div[col="keep"]').append(`<p class="toggleRow" tr="keep" tabindex="0" roleID="${reward.id}" style="color: ${reward.keep ? "lime" : "nah"}">${reward.keep ? i18n.yes : i18n.no}${reward.noSync && !excludeEnabled ? "*" : ""}</p>`)
                $('#rewards div[col="exclude"]').append(`<p class="toggleRow" tr="noSync" tabindex="0" roleID="${reward.id}" style="color: ${reward.noSync ? "red" : "lime"}">${reward.noSync ? i18n.no : i18n.yes}</p>`)
                $('#rewards div[col="delete"]').append(`<p class="deleteRow deleteReward" tabindex="0" roleID="${reward.id}"><i data-lucide="trash-2" style="color: var(--emojired); width: 20px; height: 20px; cursor: pointer;"></i></p>`)
            })
            $('#rewardCount').html(rewards.length)
            checkUnsavedChanges()
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        // role selector appending (hacky but whatever, screw frontend stuff)
        function appendRoleSelect(element, roleOption, role, onlyGrantable, hideCondition) {
            let option = roleOption.clone()
            let roleSelect = $(element)
            if (hideCondition) option.prop("hidden", true)
            if (!roleSelect.children().length) roleSelect.append(`<option value='none' selected disabled>${i18n.opt_role}</option>`)

            if (onlyGrantable && !role.grantable) {
                if (option.val() == data.guild.id) return
                option.css("color", "")
                option.prop("disabled", true)
                option.html(option.html() + i18n.too_high)
            }

            return roleSelect.append(option)
        }

        // role selectors
        data.roles.forEach(x => {
            let roleOption = $(`<option value="${x.id}">${escapeHTML(x.name)}</option>`)
            roleOption.css("color", x.color == "#000000" ? "var(--defaultrolecol)" : x.color)

            if (!x.managed) {
                appendRoleSelect('#rewardRoleSelect', roleOption, x, true, rewards.some(r => r.id == x.id));
                $('#userCardRoleSelect').append(roleOption.clone()); 
            }
            appendRoleSelect('#roleMultiplierSelect', roleOption, x, false, roleMultipliers.some(r => r.id == x.id))
        })
        
        if (db.rankCard && db.rankCard.requiredRole) {
            $('#userCardRoleSelect').val(db.rankCard.requiredRole);
        } else {
            $('#userCardRoleSelect').val("none");
        }

        let channelPrefixes = { channel: "# ", category: "📂 ", vc: "🔊 ", thread: "🧵 ", forum: "💬 "}
        let chMultiplierChannels = data.channels.map(x => `<option ${x.type == "category" ? `style="font-weight: bold"` : ""} value="${x.id}">${channelPrefixes[x.type] || "* "}${escapeHTML(x.name)}</option>`)
        $('#channelMultiplierSelect').append(`<option value='none' selected disabled>${i18n.opt_channel}</option>`).append(chMultiplierChannels)


        // add new reward role
        $('#addRewardRole').click(function() {
            lucide.createIcons();
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
                <div col="boost" style="width: 140px"><p><b>${i18n.table_multiplier}</b></p></div>
                <div col="role" style="width: 380px"><p><b>${i18n.table_role}</b></p></div>
                <div col="delete" style="width: 80px"><p><b>${i18n.table_delete}</b></p></div>
            `)

            roleMultipliers.forEach(boost => {
                let foundRole = data.roles.find(x => x.id == boost.id)
                if (!foundRole) return
                else $(`#roleMultiplierSelect option[value=${boost.id}]`).prop('hidden', true)

                $('#roleMultipliers div[col="boost"]').append(`<p class="roleMultiplierAmount numberinput" roleID="${boost.id}" min="0" max="100" decimals="4" default="1" tabindex="-1" contenteditable>${+boost.boost}x</p>`)
                $('#roleMultipliers div[col="role"]').append(`<p class="longname" style="color: ${foundRole.color == "#000000" ? "var(--defaultrolecol)" : foundRole.color}">${escapeHTML(foundRole.name)}</p>`)
                $('#roleMultipliers div[col="delete"]').append(`<p class="deleteRow deleteRoleMultiplier" tabindex="0" roleID="${boost.id}"><i data-lucide="trash-2" style="color: var(--emojired); width: 20px; height: 20px; cursor: pointer;"></i></p>`)
            })
            $('#roleMultiplierCount').html(roleMultipliers.length)
            checkUnsavedChanges()
            if (typeof lucide !== 'undefined') lucide.createIcons();
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


        // multiplier channel table
        function buildChannelMultiplierTable() {
            channelMultipliers = channelMultipliers.filter(x => data.channels.some(c => c.id == x.id))
            .sort((a, b) => data.channels.findIndex(c => c.id == a.id) - data.channels.findIndex(c => c.id == b.id))

            $('#channelMultipliers').html(`
                <div col="boost" style="width: 140px"><p><b>${i18n.table_multiplier}</b></p></div>
                <div col="channel" style="width: 380px"><p><b>${i18n.table_channel}</b></p></div>
                <div col="delete" style="width: 80px"><p><b>${i18n.table_delete}</b></p></div>
            `)

            channelMultipliers.forEach(boost => {
                let foundChannel = data.channels.find(x => x.id == boost.id)
                if (!foundChannel) return
                else $(`#channelMultiplierSelect option[value=${boost.id}]`).prop('hidden', true)

                $('#channelMultipliers div[col="boost"]').append(`<p class="channelMultiplierAmount numberinput" channelID="${boost.id}" min="0" max="100" decimals="4" default="1" tabindex="-1" contenteditable>${+boost.boost}x</p>`)
                $('#channelMultipliers div[col="channel"]').append(`<p class="longname">${channelPrefixes[foundChannel.type] || "* "}${escapeHTML(foundChannel.name)}</p>`)
                $('#channelMultipliers div[col="delete"]').append(`<p class="deleteRow deleteChannelMultiplier" tabindex="0" channelID="${boost.id}"><i data-lucide="trash-2" style="color: var(--emojired); width: 20px; height: 20px; cursor: pointer;"></i></p>`)
            })
            $('#channelMultiplierCount').html(channelMultipliers.length)
            checkUnsavedChanges()
            if (typeof lucide !== 'undefined') lucide.createIcons();
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
                        if (aType == "number" || aType == "range") settings[property] = +val
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

    lucide.createIcons();

    let defaultData = generateSaveJSON()
    updateHomeInfo(defaultData)
    lastSavedData = JSON.stringify(defaultData)

    $('#everything').show()
    $('#loading').hide()
    
    const standardPalette = ["#FFA500", "#FF5252", "#4CAF50", "#2196F3", "#9C27B0", "#FFFFFF", "#000000"];
    
    $('.swatch-container').each(function() {
        let container = $(this);
        let targetId = container.attr('data-target');
        
        if (container.hasClass('with-none')) {
            container.append(`<div class="color-swatch none-swatch" data-color="none" title="Sin color (Transparente)"></div>`);
        }
        
        standardPalette.forEach(hex => {
            let border = (hex === "#000000") ? "1px solid #444" : "1px solid transparent";
            container.append(`<div class="color-swatch" data-color="${hex}" style="background-color: ${hex}; border: ${border};" title="${hex}"></div>`);
        });
    });

    $(document).on('click', '.color-swatch', function() {
        let targetId = $(this).parent().attr('data-target');
        let selectedColor = $(this).attr('data-color');
        
        $('#' + targetId).val(selectedColor).trigger('change');
        if (selectedColor !== 'none') $('#' + targetId + 'Picker').val(selectedColor);
        
        $(this).parent().find('.color-swatch').css('box-shadow', 'none');
        $(this).css('box-shadow', '0 0 0 2px white');
    });

    $('.colorPickerBtn').on('input', function() {
        let targetId = $(this).attr('id').replace('Picker', '');
        $('#' + targetId).val($(this).val()).trigger('change');
    });

    $('.shape-btn').click(function() {
        $('.shape-btn').removeClass('active');
        $(this).addClass('active');
        $('#rcAvatarShape').val($(this).attr('data-shape')).trigger('change');
    });

    let previewTimeout;
    
    function requestLivePreview() {
        $('#livePreviewImage').css('opacity', '0.5');
        $('#previewLoading').show();

        let parsedOp = parseFloat($('#rcOp').val());
        let finalOpacity = isNaN(parsedOp) ? 0.8 : parsedOp;

        let currentSettings = {
            backgroundURL: $('#rcBg').val(),
            backgroundFit: $('#rcFit').val() || 'cover',
            backgroundColor: $('#rcBgCol').val() || '#1e1f22',
            overlayColor: $('#rcOverlayCol').val() || '#000000',
            opacity: finalOpacity, // <- Usamos la variable corregida
            barColor: $('#rcBar').val() || '#FFA500',
            textColor: $('#rcText').val() || '#FFFFFF',
            avatarShape: $('#rcAvatarShape').val() || 'circle',
            avatarBorderColor: $('#rcAvatarCol').val() || 'none'
        };

        $.ajax({
            url: "/api/previewRankCard",
            type: "post",
            data: JSON.stringify({ guildID: guildID, previewSettings: currentSettings }),
            headers: { 'Content-Type': 'application/json' },
            xhrFields: { responseType: 'blob' }
        })
        .done(function(blob) {
            let url = URL.createObjectURL(blob);
            $('#livePreviewImage').attr('src', url).css('opacity', '1').show();
            $('#previewLoading').hide();
        })
        .fail(function(e) {
            console.error("Error preview", e);
            $('#previewLoading').html('<p style="color: #ff5252;">Error al generar vista previa.</p>');
        });
    }

    function triggerPreview() {
        clearTimeout(previewTimeout);
        previewTimeout = setTimeout(requestLivePreview, 500); // 500ms de espera al terminar de mover
    }

    $('#rcOp').on('input', function() { $('#rcOpVal').text($(this).val()); });
    
    $('#rcBg, #rcOp, #rcBar, #rcText, #rcFit, #rcBgCol, #rcOverlayCol, #rcAvatarCol, #rcAvatarShape').on('input change', triggerPreview);
    
    $('#toggleImageCard').on('change', function() {
        if($(this).prop('checked')) {
            $('.customRankCardSettings').show();
            triggerPreview();
        }
    });

    if (db.rankCard) {
        if (db.rankCard.useImageCard) {
            $('.customRankCardSettings').show();
        }

        if (db.rankCard.allowUserCards) {
            $('.userCardSettings').show();
        }
        
        let currentShape = db.rankCard.avatarShape || 'circle';
        $('.shape-btn').removeClass('active');
        $(`.shape-btn[data-shape="${currentShape}"]`).addClass('active');

        ['rcBgCol', 'rcOverlayCol', 'rcAvatarCol', 'rcBar', 'rcText'].forEach(id => {
            let val = $(`#${id}`).val();
            if (val !== 'none' && val !== '') {
                $(`#${id}Picker`).val(val);
            }
            
            let container = $(`.swatch-container[data-target="${id}"]`);
            container.find('.color-swatch').css('box-shadow', 'none');
            let matchedSwatch = container.find(`.color-swatch[data-color="${val}"]`);
            if (matchedSwatch.length) {
                matchedSwatch.css('box-shadow', '0 0 0 2px white');
            }
        });

        let currentOpacity = db.rankCard.opacity !== undefined ? db.rankCard.opacity : 0.8;
        $('#rcOp').val(currentOpacity);
        $('#rcOpVal').text(currentOpacity);

        if (db.rankCard.useImageCard) {
            triggerPreview();
        }
    }
    
    }).catch((e) => {
        console.error(e)
        $('#errorheader').css('margin-top', '70px')
        if (e.apiError) switch (e.code) {
            case "noPerms":
                $('#errorheader').text(i18n.err_no_perms_title)
                $('#errorfooter').text(i18n.err_no_perms_desc)
                break;

            case "login":
                $('#errorheader').text(i18n.err_login_title)
                $('#errorfooter').text(i18n.err_login_desc)
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
        if (lvlEmbedEnabled && !validateEmbedJSON()) return alert(i18n.alert_invalid_embed)
        else requestInProgress = true
        $('#saveChanges').html(i18n.btn_saving)
        let savejson = compareSaveJSON()
        if (savejson["levelUp.message"] && !savejson["levelUp.embed"]) savejson["levelUp.embed"] = lvlEmbedEnabled
        $.ajax({
            url: "/api/settings", type: "post",
            data: JSON.stringify(Object.assign(savejson, {guildID})),
            headers: { 'Content-Type': 'application/json'}
        })
        .done(function(res) {
            requestInProgress = false
            $('#saveChanges').html(i18n.btn_save)
            let newSave = generateSaveJSON()
            lastUpdated = Date.now()
            updateHomeInfo(newSave)
            lastSavedData = JSON.stringify(newSave)
            $('#unsavedWarning').removeClass('activeWarning')
        })
        .fail(function (e) {
            requestInProgress = false
            $('#saveChanges').html(i18n.btn_save)
            alert(`${i18n.alert_error} ${e.responseText}`);
            console.error(e)
        })
    })

    $('#resetSettings').click(function() {
        if (requestInProgress) return
        else if (!confirm(i18n.confirm_reset_settings)) return
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
            alert(`${i18n.alert_error} ${e.responseText}`);
            console.error(e)
        })
    })

    $('#resetXP').click(function() {
        if (requestInProgress) return
        else if (!confirm(i18n.confirm_reset_xp)) return
        requestInProgress = true
        $.ajax({
            url: "/api/settings", type: "post",
            data: JSON.stringify({guildID, resetXP: true}),
            headers: { 'Content-Type': 'application/json'}
        })
        .done(function(res) {
            requestInProgress = false
            alert(i18n.alert_xp_reset)
            $('.confirmReset').hide()
            $('.confirmConfirmReset').hide()
        })
        .fail(function (e) {
            requestInProgress = false
            alert(`${i18n.alert_error} ${e.responseText}`);
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
                return res.json().then(e => { alert(`${i18n.alert_error} ${e.message}`); }).catch(() => { alert(i18n.alert_error) })
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
            alert(`${i18n.alert_error} ${e.responseText}`);
            console.error(e)
        })
    })

    $('#sendExample').click(function() {
        if (requestInProgress) return

        let exampleLevel = Number($('#exampleLevel').val())
        let saveData = generateSaveJSON()
        let embedMode = saveData['levelUp.embed']
        if (embedMode && !validateEmbedJSON()) return alert(i18n.alert_invalid_embed_test)
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

            if (res.matches < 1) return alert(`${i18n.alert_prune_nobody} ${amt} ${i18n.alert_prune_xp}`)

            if (confirm(`${i18n.confirm_prune_1} ${commafy(res.matches)} ${i18n.confirm_prune_2}${res.matches == 1 ? "" : "s"}, ${i18n.confirm_prune_3} ${commafy(res.total - res.matches)} ${i18n.confirm_prune_4}`)) {
                
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
                    alert(i18n.alert_prune_fail + e.message)
                    console.error(e)
                })

            }
        })
        .fail(function (e) {
            requestInProgress = false
            setTimeout(() => { $('#confirmPrune').prop('disabled', false) }, 1000);
            alert(i18n.alert_prune_count_fail + e.message)
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

        if (hasUnsavedChanges()) return alert(i18n.alert_unsaved)

        let botName = $('#importfrom').find(":selected").text().split("(")[0].trim()
        let importBot = $('#importfrom').val()
        let importGroup = $(`.importdiv[importtype='${importBot}']`)

        let jsonData;
        if (importBot == "json") {
            let jsonfile = $('#importJSONFile').prop('files')[0]
            if (!jsonfile) return alert(i18n.alert_no_json)
            jsonData = await readJSONFile(jsonfile).catch(() => null)
            if (!jsonData) return alert(i18n.alert_parse_fail)
            if (Array.isArray(jsonData) && jsonData[0] && jsonData[0].xp && !confirm(i18n.confirm_json_xp_only)) return
        }

        if (!importGroup.length) return alert(i18n.alert_invalid_bot)
        if (failedImports.includes(importBot)) return alert(`${i18n.alert_import_cooldown} ${botName}${i18n.alert_import_cooldown_2}`)

        let importSettings = { bot: importBot }
        importGroup.find('.importSetting').each(function() {
            importSettings[$(this).attr("option")] = $(this).attr("type") == "checkbox" ? $(this).prop("checked") : $(this).val()
        })

        if (!importSettings.xp && (!importSettings.settings && !importSettings.rewardroles)) return alert(i18n.alert_import_select)

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
                if (e.responseJSON.code == "noData") alert(isJSON ? i18n.alert_import_nodata_json : i18n.alert_import_nodata)
                else alert(i18n.alert_import_fail + e.responseJSON.message)  
                if (e.responseJSON.code != "importCooldown" && e.responseJSON.code != "invalidImport") {
                    if (!isJSON) failedImports.push(importBot)
                    setTimeout(() => {
                        failedImports = failedImports.filter(x => x != importBot)
                    }, 30 * 1000);
                }
            }
            else {
                alert(i18n.alert_import_fail + e.message)  
            }
            console.error(e)
        })
    })