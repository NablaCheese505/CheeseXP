if (window.location.search.includes("authorized")) {
    let savedURL = localStorage.polaris_url
    if (savedURL && savedURL.startsWith("/")) window.location.href = savedURL
    else window.history.pushState("", "", './')
}
delete localStorage.polaris_url

Fetch("/api/loggedin").then(data => {
    if (!data || !data.login || !data.login.id) {
        let loginText = $('#manageButton').attr('data-login-text') || "Log in";
        $('#manageButton').text(loginText);
    }
    if (data && data.botPublic) $("#addLink").show();
    $('#manageLink').show()
}).catch(() => {
    $('#manageLink').show()
})

$(document).ready(function(){
    $(this).scrollTop(0);
});