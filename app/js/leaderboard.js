let guildID = window.location.pathname.split("/").pop()
let serverName = guildID
let page = 1
let totalPages = 1
let setPage;

let leaderboardSlot = $('.leaderboardSlot[slot=leaderboard]').first().clone()
let roleSlot = $('.leaderboardSlot[slot=role]').first().clone()
let progressSlot = $('.leaderboardSlot[slot=progress]').first().clone()
let hiddenSlot = $('.hiddenMemberSlot[slot=hidden]').first().clone()

let pageCache = {}

addUhOh()

$('.leaderboardSlot').remove()
$('.hiddenMemberSlot').remove()

function commafy(num) {
    if (isNaN(num)) return 0
    else return num.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

function getLevel(xp, settings) {
    let lvl = 0
    let previousLevel = 0
    let xpRequired = 0                
    while (xp >= xpRequired && lvl <= settings.maxLevel) { 
        lvl++
        previousLevel = xpRequired
        xpRequired = this.xpForLevel(lvl, settings)
    }
    lvl--
    let percentage = lvl >= settings.maxLevel ? 100 : (xp - previousLevel) / (xpRequired - previousLevel) * 100
    return { level: lvl, xpRequired, previousLevel, percentage }
}

function xpForLevel(lvl, settings) {
    if (lvl > settings.maxLevel) lvl = settings.maxLevel
    let xpRequired = Object.entries(settings.curve).reduce((total, n) => total + (n[1] * (lvl ** n[0])), 0)
    return settings.rounding > 1 ? settings.rounding * Math.round(xpRequired / settings.rounding) : xpRequired
}

this.getMultiplier = function(roles=[], settings, roleList) {
    let roleBoosts = settings.multipliers.roles.filter(x => roles.includes(x.id))
    if (roleBoosts.length) {
        let foundBoosts;

        let foundXPBan = roleBoosts.find(x => x.boost <= 0)
        if (foundXPBan) foundBoosts = foundXPBan

        else switch (settings.multipliers.rolePriority) {
            case "smallest": 
                foundBoosts = roleBoosts.sort((a, b) => a.boost - b.boost)[0]; break;
            case "highest": 
                let foundTopBoost = roleList.find(x => roleBoosts.find(y => y.id == x.id))
                foundBoosts = roleBoosts.find(x => x.id == foundTopBoost.id); break;
            case "combine": 
                foundBoosts = roleBoosts; break;
            case "add": 
                foundBoosts = roleBoosts.filter(x => x.boost != 1); break;
            default: 
                foundBoosts = roleBoosts.sort((a, b) => b.boost - a.boost)[0]; break;
        }
        if (!Array.isArray(foundBoosts)) foundBoosts = [foundBoosts]

        if (settings.multipliers.rolePriority == "combine") {
            let combined = foundBoosts.map(x => x.boost).reduce((a, b) => a * b, 1).toFixed(4) 
            combined = Math.min(+combined, 1000000) 
            return { roles: foundBoosts, boost: Number(combined.toFixed(4)) }
        }

        else if (settings.multipliers.rolePriority == "add") {
            let summed = foundBoosts.length == 1 ? foundBoosts[0].boost : foundBoosts.map(x => x.boost).reduce((a, b) => a + (b - 1), 1).toFixed(4) 
            return { roles: foundBoosts, boost: Math.max(0, summed) }
        }

        else return { roles: foundBoosts, boost: Number(foundBoosts[0].boost.toFixed(4)) }

    }   
    else return { roles: [], boost: 1 }
}

function roleCol(col, defaultCol="white") {
    return col == "#000000" ? defaultCol : col
}

Fetch(`/api/leaderboard/${guildID}`).then(data => {

    console.log(data)
    document.title = window.i18n.leaderboardFor + data.guild.name
    $('#serverName').text(window.i18n.leaderboardFor + data.guild.name)
    updateRankedCount(data)

    pageCache[data.pageInfo.page] = data
    totalPages = data.pageInfo.pageCount
    if (totalPages <= 1) $('#pageInfo').remove()
    else {
        $('#totalPages').text(totalPages)
        $('#pageNumber').attr("max", totalPages)
    }

    let loggedIn = !data.user.noLogin

    if (loggedIn) $('.plsLogIn').remove()
    else {
        $('#accountInfo').remove()
        $('#bigLoginBtn').show()
        $('#yourrank').prop('disabled', true)
    }

    if (!data.moderator) $('#addxp').remove()

    else if (data.moderator && data.settings.leaderboard.disabled) {
        $('#notInServerWarning').html('The leaderboard is currently disabled!<br><span style="font-size: 18px; font-weight: normal">Only moderators can view this page.</span>')
        $('#notInServerWarning').show()
    }

    if (loggedIn && data.user.missing) {
        $('#notInServerWarning').show()
        $('#yourrank').prop('disabled', true)
    }

    checkHiddenMembers(data)

    let userLevel = getLevel(data.user.xp || 0, data.settings)
    let userColor = roleCol(data.user.color)
    let userMultiplier = getMultiplier(data.user.roles, data.settings, data.roles)

    function updateRankedCount(dat) {
        let memberText = dat.guild.members == 1 ? window.i18n.member : window.i18n.members
        $('#serverMembers').html(`${commafy(dat.guild.members)} ${memberText} &nbsp; • &nbsp; ${commafy(dat.guild.totalRanked)}${dat.guild.totalPartial ? "+" : ""} ${window.i18n.ranked}`)
    }

    function appendLeaderboard(leaderboard) {
        $('#leaderboard').html("")
        leaderboard.forEach(x => {
            let userSlot = leaderboardSlot.clone()
            let userXP = getLevel(x.xp, data.settings)
            let multiplier = getMultiplier(x.roles, data.settings, data.roles)
            if (x.missing) {
                userSlot.addClass('notInServer')
                userSlot.find("[lb=warning]").show()
                if (data.moderator) userSlot.find("[lb=hideUser]").attr('userID', x.id).show()
            }
            if (data.moderator) {
                userSlot.addClass('canManage')
                userSlot.attr("userID", x.id)
                userSlot.attr("tabindex", 0)
            }
            if (x.id == data.user.id) userSlot.addClass('isSelf')
            userSlot.find("[lb=rank]").text("#" + commafy(x.rank)).css("font-size", x.rank > 999 ? "18px" : x.rank > 99 ? "20px" : "22px")
            userSlot.find("[lb=name]").text(x.nickname || x.displayName || `<@${x.id}>`).attr("title", x.missing ? "Not in server!" : `${x.displayName} (@${x.username})`)
            userSlot.find("[lb=level]").text(`${window.i18n.level} ${commafy(userXP.level)}`)
            userSlot.find("[lb=pfp]").attr("src", x.avatar || "/assets/avatar.png")
            userSlot.find("[lb=progress]").css("background-color", x.missing ? "rgba(118, 126, 137, 0.5)" : roleCol(x.color || "white")).css("width", userXP.percentage + "%")
            userSlot.find("[lb=xp]").html(`${commafy(x.xp)} / ${commafy(userXP.xpRequired)} ${window.i18n.xp}${data.settings.rankCard.relativeLevel ? ` &nbsp • &nbsp; ${commafy(x.xp - userXP.previousLevel)} / ${commafy(userXP.xpRequired - userXP.previousLevel)}` : ""}`)
            userSlot.find("[lb=percent]").text(`(${+userXP.percentage.toFixed(2)}%)`)

            if (multiplier.roles.length) {
                let mult = userSlot.find("[lb=multiplier]")
                let multText;
                mult.show()
                if (multiplier.roles.length == 1) {
                    let foundRole = data.roles.find(x => x.id == multiplier.roles[0].id)
                    multText = foundRole.name
                    if (foundRole.color != "#000000") mult.css("color", foundRole.color)
                }

                else { 
                    multText = `${multiplier.roles.length} ${window.i18n.roles}`
                }

                mult.text(`${multText} - ${multiplier.boost}x ${window.i18n.xp}`)
            }

            $('#leaderboard').append(userSlot)
        })

        if (data.moderator) {
            $('.canManage').hover(function() {
                $(this).find('.editIcon').show()
            },
            function() {
                $(this).find('.editIcon').hide()
            })

            $(document).on('keydown', '.canManage', function(e) {
                if (["Enter", "Space"].includes(e.code)) $(this).click()
            })
        }

        if (data.leaderboard.length) $('#noXPYet').remove()
        else {
            $('#leaderboard').remove();
            $('#noXPYet').show()
            if (data.settings.leaderboard.minLevel > 0) $('#noXPYet').html(`${window.i18n.nobodyMinLevel}<br><span style="opacity: 66%; font-size: 18px; line-height: 46px">(${window.i18n.level} ${commafy(data.settings.leaderboard.minLevel)} ${window.i18n.levelRequired})</span>`)
        }
    }
    appendLeaderboard(data.leaderboard)

    // reward roles
    data.settings.rewards.sort((a, b) => a.level - b.level).forEach(r => {
        let rSlot = roleSlot.clone()
        let role = data.roles.find(x => r.id == x.id)
        let roleXP = xpForLevel(r.level, data.settings)
        let roleProgress = (!loggedIn || !data.user.id) ? 0 : data.user.xp / roleXP * 100
        let roleColor = roleCol(role.color)
        let reachedRole = roleProgress >= 100
        let hasRole = loggedIn && data.user.id && data.user.roles.includes(r.id)
        rSlot.find("[lb=role]").text(role.name).css("color", roleColor)
        rSlot.find("[lb=level]").text(`${window.i18n.level} ` + commafy(r.level)).css("color", reachedRole ? roleColor : "#bbbbbb")
        rSlot.find("[lb=percent]").text(!loggedIn ? `${commafy(roleXP)} ${window.i18n.xp}` : reachedRole ? (hasRole ? window.i18n.obtained : window.i18n.reached) : `${+roleProgress.toFixed(2)}% ${window.i18n.reachedLower} (${commafy(data.user.xp || 0)} / ${commafy(roleXP)} ${window.i18n.xp})`)
        rSlot.find("[lb=progress]").css("width", Math.min(roleProgress, 100) + "%").css("background-color", roleColor)
        $('#roleList').append(rSlot)
    })
    if (data.settings.rewards.length) $('#noRewardRoles').remove()
    else {
        $('#roleList').remove()
        if (data.settings.leaderboard.hideRoles) {
            $('#noRewardRoles').text(window.i18n.hiddenRoles)
            $('#lbButtons').find("button[box='roles']").hide()
        }
    }

    // all levels
    for (let i=1; i <= data.settings.maxLevel; i++) {
        let lvlSlot = progressSlot.clone()
        let lvlXP = xpForLevel(i, data.settings)
        let lvlProgress = !loggedIn ? 0 : data.user.xp ? data.user.xp / lvlXP * 100 : 0
        let lvlHue = i * 360 / 100

        if (i == userLevel.level + 1) lvlSlot.addClass('highlightedSlot')
        lvlSlot.find("[lb=level]").text(`${window.i18n.level} ` + commafy(i)).css("color", userLevel.level >= i ? `hsl(${lvlHue}, 90%, 70%)` : `hsl(${lvlHue}, 70%, 90%)`)
        lvlSlot.find("[lb=xp]").text(commafy(lvlXP) + ` ${window.i18n.xp}`).css("color", userLevel.level >= i ? `hsl(${lvlHue}, 90%, 70%)` : `hsl(${lvlHue}, 70%, 90%)`)
        lvlSlot.find("[lb=percent]").text(`${Number(Math.min(100, lvlProgress).toFixed(2))}% ${window.i18n.reachedLower}${lvlProgress >= 100.5 ? ` (${commafy(Math.round(lvlProgress))}%)` : ""}`)
        lvlSlot.find("[lb=progress]").css("background-color", `hsl(${lvlHue}, 100%, 50%)`).css("width", Math.min(lvlProgress, 100) + "%")
        $('#progress').append(lvlSlot)

        if (i % 50 == 0 && lvlProgress < 1 && i > 50) break; 
    }

    if (loggedIn && data.user.xp) {
        if (data.user.partial) {
            $('#accountPartial').show()
            $('.statBox[stat="roles"]').hide()
        }

        $('#noRankInfo').remove()

        // account info
        $('#accountInfo [lb=pfp]').attr('src', data.user.avatar)
        $('#accountInfo [lb=name]').text(data.user.nickname || data.user.displayName).css("color", userColor)
        $('#accountInfo [lb=level]').text(`${window.i18n.level} ${commafy(userLevel.level)}`).css("color", userColor)
        $('#accountInfo [lb=progress]').css('background-color', userColor).css('width', userLevel.percentage + "%")
        $('#accountInfo [lb=xp]').text(`${commafy(data.user.xp)} / ${commafy(userLevel.xpRequired)} ${window.i18n.xp}`).css("color", userColor)
        $('#accountInfo [lb=percent]').text(`(${+userLevel.percentage.toFixed(2)}%)`).css("color", userColor)
        $('#accountInfo [lb=ranking]').text(data.user.hidden ? window.i18n.hiddenFromLb : `${window.i18n.rankedNum}${data.user.rank}${window.i18n.inStr}${data.guild.name}`)
        $('#accountInfo [lb=prev]').text(commafy(userLevel.previousLevel) + ` ${window.i18n.xp}`)
        $('#accountInfo [lb=sinceprev]').text(commafy(data.user.xp - userLevel.previousLevel) + ` ${window.i18n.xp}`)
        $('#accountInfo [lb=tonext]').text(userLevel.level >= data.settings.maxLevel ? window.i18n.maxLevel : commafy(Math.max(0, userLevel.xpRequired - data.user.xp)) + ` ${window.i18n.xp}`)

        let obtainedRoles = data.settings.rewards.filter(x => x.level <= userLevel.level).sort((a, b) => b.level - a.level)
        let topRole = obtainedRoles[0] ? data.roles.find(x => x.id == obtainedRoles[0].id) : null

        let minXP = Math.round(data.settings.gain.min * userMultiplier.boost)
        let maxXP = Math.round(data.settings.gain.max * userMultiplier.boost)

        $('#accountInfo [lb=toprole]').text(topRole ? topRole.name : window.i18n.none).css("color", roleCol((topRole || {}).color))
        $('#accountInfo [lb=totalroles]').text(`${commafy(obtainedRoles.length)} / ${commafy(data.settings.rewards.length)}`).css("color", roleCol((topRole || {}).color))
        $('#accountInfo [lb=xppermessage]').text((minXP == maxXP ? commafy(minXP) : `${commafy(minXP)} - ${commafy(maxXP)}`) + (data.settings.hideMultipliers ? "?" : ""))
        $('#accountInfo [lb=cooldown]').text(timeStr(data.settings.gain.time * 1000, 1))

        let estimatedMin = Math.ceil((userLevel.xpRequired - data.user.xp) / (data.settings.gain.min * userMultiplier.boost))
        let estimatedMax = Math.ceil((userLevel.xpRequired - data.user.xp) / (data.settings.gain.max * userMultiplier.boost))
        let estimatedRange = estimatedMin < 0 ? "N/A" : (estimatedMax == estimatedMin) ? `${commafy(estimatedMax)}` : `${commafy(estimatedMax)} - ${commafy(estimatedMin)} (${window.i18n.avg} ${commafy(Math.round((estimatedMax + estimatedMin) / 2))})`
        $('#accountInfo [lb=messages]').text(estimatedRange)

        if (userMultiplier.roles.length) {
            if (userMultiplier.roles.length == 1) {
                let foundMultiplier = data.roles.find(x => x.id == userMultiplier.roles[0].id)
                $('#accountInfo [lb=multiplier]').text(`${foundMultiplier.name} (${userMultiplier.boost}x ${window.i18n.xp})`).css("color", roleCol(foundMultiplier.color))
            }
            else $('#accountInfo [lb=multiplier]').text(`${userMultiplier.roles.length} ${window.i18n.roles} (${userMultiplier.boost}x ${window.i18n.xp})`)
        }
        else $('#accountInfo [lb=multiplier]').text(data.settings.hideMultipliers ? window.i18n.hidden : window.i18n.none1x)
    }
    else if (loggedIn && !data.user.xp) {
        $('#accountInfo').remove()
    }

    let loadingPage = false
    setPage = async function(pg, force) {
        if (!force && loadingPage) return
        loadingPage = true
        let oldPage = page
        let savedScroll = 0
        if (page == pg && $('#leaderboard').is(":visible")) savedScroll = $('html').scrollTop()   
        page = (pg || 1)
        if (page > totalPages) page = totalPages
        else if (page < 1) page = 1
        $('#pageNumber').val(page)
        $('#pageDown').prop('disabled', page <= 1)
        $('#pageUp').prop('disabled', page >= totalPages)
        document.activeElement.blur();
        if (!force && page == oldPage) return loadingPage = false

        let res = (!force && pageCache[page]) ? pageCache[page] : await Fetch(`/api/leaderboard/${guildID}?page=${page}`)
        pageCache[res.pageInfo.page] = { leaderboard: res.leaderboard, pageInfo: res.pageInfo }
        $('html').scrollTop(savedScroll)
        appendLeaderboard(res.leaderboard)

        if (res.moderator) checkHiddenMembers(res)
        else $('#hiddenMemberTab').hide()

        if (res.guild) updateRankedCount(res)

        loadingPage = false
    }

    $(document).on('click', '.leaderboardSlot.canManage', function() {
        if (!data.moderator) return
        $('.popup').hide()
        let foundUser = pageCache[page].leaderboard.find(x => x.id == $(this).attr('userID'))
        if (!foundUser) return

        let defaultAdd = data.settings.gain.max * 10
        let oldLevel = getLevel(foundUser.xp, data.settings)
        let newLevel = getLevel(foundUser.xp + defaultAdd, data.settings)
        let newXP = foundUser.xp + defaultAdd

        $('#selecteduser').text(foundUser.missing ? window.i18n.missingUser : `${foundUser.displayName}`)
        $('#selectedusername').text(`@${foundUser.username}`)
        $('#selectedid').text(`(${window.i18n.id}: ${foundUser.id})`)
        $('#addtype').val("addxp")
        $('#addamount').val(defaultAdd)

        $('#oldxp').text(`${commafy(foundUser.xp)} (${window.i18n.level} ${commafy(oldLevel.level)})`)
        $('#newxp').text(`${commafy(newXP)} (${window.i18n.level} ${commafy(newLevel.level)})`)

        $('#addxp').show()

        $('#addamount').focus()

        $('#addamount').off("input")
        $('#addamount').on("input", function() {
            if (isUpdating) return
            let amt = +$("#addamount").val() || 0
            let levelChange = oldLevel.level
            let changeLevel = false
            newXP = foundUser.xp

            switch ($('#addtype').val()) {
                case "addxp": newXP += amt; break;
                case "setxp": newXP = amt; break;
                case "addlevel": changeLevel = true; levelChange += amt; break;
                case "setlevel": changeLevel = true; levelChange = amt; break;
            }

            if (changeLevel) newXP = xpForLevel(levelChange, data.settings)
            if (newXP < 0) newXP = 0
            if (newXP > 1e12) newXP = (1e12 - 1)

            let newNewLevel = getLevel(newXP, data.settings)
            $('#newxp').text(`${commafy(newXP)} (${window.i18n.level} ${commafy(newNewLevel.level)})`)
        })

        $('#addtype').off("change")
        $('#addtype').change(function() {
            if (isUpdating) return
            switch ($('#addtype').val()) {
                case "addxp": $('#addamount').val(defaultAdd); break;
                case "setxp": $('#addamount').val(foundUser.xp); break;
                case "addlevel": $('#addamount').val("10"); break;
                case "setlevel": $('#addamount').val(oldLevel.level + 1); break;
            }
            $('#addamount').trigger('input')
        })

        $('#savexp').off('click')
        $('#savexp').click(function() {
            if (isUpdating) return
            if (newXP == foundUser.xp) $('.popup').hide()

            isUpdating = true
            $.ajax({
                url: "/api/editXP", type: "post",
                data: JSON.stringify({guildID, user: foundUser.id, xp: newXP}),
                headers: { 'Content-Type': 'application/json'}
            })
            .done(function(res) {
                if (foundUser.id == data.user.id) return window.location.reload() 
                pageCache = {}
                setPage(page, true)
                $('.popup').hide()
                isUpdating = false
            })
            .fail(function (e) {
                alert(`Error! ${e.responseText}`);
                console.error(e)
                $('.popup').hide()
                isUpdating = false
            })

        })
    })

    $(document).on('click', '.hideFromLeaderboard', function(e) {
        if (!data.moderator) return
        $('.popup').hide()
        let foundUser = pageCache[page].leaderboard.find(x => x.id == $(this).attr('userID'))
        if (!foundUser) return
        e.stopImmediatePropagation()
        e.preventDefault()

        function hideMember() {
            if (isUpdating) return
            isUpdating = true
            $.ajax({
                url: "/api/leaderboardHide", type: "post",
                data: JSON.stringify({guildID, user: foundUser.id, hide: true}),
                headers: { 'Content-Type': 'application/json'}
            })
            .done(function(res) {
                pageCache = {}
                setPage(page, true)
                $('.popup').hide()
                isUpdating = false
            })
            .fail(function (e) {
                alert(`Error! ${e.responseText}`);
                console.error(e)
                $('.popup').hide()
                isUpdating = false
            })
        }

        if (e.originalEvent.shiftKey) hideMember()
        else {
            $('#confirmHide').show()
            $('#hideConfirmation').off('click')
            $('#hideConfirmation').click(hideMember)
        }
    })

    $(document).on('click', '.unhideMember', function(e) {
        if (!data.moderator || !data.hiddenMembers) return
        let foundUser = data.hiddenMembers.find(x => x.id == $(this).attr('userID'))

        if (isUpdating) return
        isUpdating = true
        $.ajax({
            url: "/api/leaderboardHide", type: "post",
            data: JSON.stringify({guildID, user: foundUser.id, hide: false}),
            headers: { 'Content-Type': 'application/json'}
        })
        .done(function(res) {
            pageCache = {}
            setPage(page, true)
            isUpdating = false
        })
        .fail(function (e) {
            alert(`Error! ${e.responseText}`);
            console.error(e)
            $('.popup').hide()
            isUpdating = false
        })
    })

    function checkHiddenMembers(dat) {
        if (!dat) return
        $('#hiddenMemberList').html("")

        if (dat.hiddenMembers && dat.hiddenMembers.length > 0) {
            data.hiddenMembers = dat.hiddenMembers
            $('#hiddenMemberTab').show()

            dat.hiddenMembers.forEach(x => {
                let hidSlot = hiddenSlot.clone()
                hidSlot.find("[lb=id]").text(`${window.i18n.id}: ${x.id}`)
                hidSlot.find("[lb=xp]").html(`${window.i18n.level} ${commafy(getLevel(x.xp, dat.settings).level)} &nbsp; • &nbsp; ${commafy(x.xp)} ${window.i18n.xp}`)
                hidSlot.find("[lb=unhide]").attr("userID", x.id)
                $('#hiddenMemberList').append(hidSlot)
            })
        }

        else $('#hiddenMemberTab').hide()
    }

    $('#everything').show()
    $('#loading').hide()

}).catch((e) => {
    console.error(e)
    if (e.apiError) switch (e.code) {
        case "invalidServer":
            $('#errorheader').text(window.i18n.errors.no_lb_title)
            $('#errorfooter').text(window.i18n.errors.no_lb_desc)
            break;

        case "privateLeaderboard":
            $('#errorheader').text(window.i18n.errors.private_lb_title)
            $('#errorfooter').text(window.i18n.errors.private_lb_desc)
            $('#loginbutton').show()
            break;

        case "xpDisabled":
            $('#errorheader').text(window.i18n.errors.xp_disabled_title)
            $('#errorfooter').text(window.i18n.errors.xp_disabled_desc)
            break;

        case "leaderboardDisabled":
            $('#errorheader').text(window.i18n.errors.lb_disabled_title)
            $('#errorfooter').text(window.i18n.errors.lb_disabled_desc)
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

$('#lbButtons button').click(function() {
    let box = $(this).attr('box')
    $('.selectedlb').removeClass('selectedlb')
    $(this).addClass('selectedlb')
    $('.lbBox').hide()
    $(`[box=${box}]`).show()
})

let isUpdating = false

$(document).on('click', '.box', function (e) {
    e.stopPropagation();
})

$(document).on('click', '.popup', function () {
    if (!isUpdating) $('.popup').hide()
})

$(document).on('keydown', function (e) {
    if (!isUpdating && e.code == "Escape")  $('.popup').hide()
})