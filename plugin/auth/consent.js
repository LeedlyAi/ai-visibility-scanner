const status = document.getElementById("status");
const form = document.getElementById("sign-in");
const consent = document.getElementById("consent");
const approve = document.getElementById("approve");
const deny = document.getElementById("deny");

function sameCallback(candidate, callback) {
  const destination = new URL(candidate);
  const expected = new URL(callback);
  return !destination.username && !destination.password &&
    destination.origin === expected.origin && destination.pathname === expected.pathname;
}

async function start() {
  const authorizationId = new URL(location.href).searchParams.get("authorization_id");
  if (!authorizationId || authorizationId.length > 256) throw new Error("Invalid authorization request.");
  const response = await fetch("/oauth/config.json");
  if (!response.ok) throw new Error("Sign-in is unavailable.");
  const { projectUrl, publishableKey, clientId, callback } = await response.json();
  const client = window.supabase.createClient(projectUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  function redirect(url) {
    if (!sameCallback(url, callback)) throw new Error("Unexpected return address.");
    location.assign(url);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector("button");
    submit.disabled = true;
    try {
      const fields = new FormData(form);
      const { error } = await client.auth.signInWithPassword({
        email: fields.get("email"), password: fields.get("password"),
      });
      form.elements.password.value = "";
      if (error) throw new Error("Sign-in failed.");
      const details = await client.auth.oauth.getAuthorizationDetails(authorizationId);
      if (details.error || !details.data) throw new Error("Invalid authorization request.");
      if (!("authorization_id" in details.data)) return redirect(details.data.redirect_url);
      if (details.data.client?.id !== clientId || details.data.scope !== "openid" ||
          !sameCallback(details.data.redirect_uri, callback)) throw new Error("Unexpected access request.");
      form.hidden = true;
      consent.hidden = false;
      status.textContent = "Review what ChatGPT can do with this account.";
    } catch {
      status.textContent = "Sign-in or authorization failed. Check your account or restart from ChatGPT.";
    } finally {
      submit.disabled = false;
    }
  });

  async function respond(accepted) {
    approve.disabled = deny.disabled = true;
    try {
      const result = await (accepted
        ? client.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : client.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true }));
      if (result.error || !result.data) throw new Error("Consent failed.");
      redirect(result.data.redirect_url);
    } catch {
      status.textContent = "The connection could not be completed. Please try again.";
      approve.disabled = deny.disabled = false;
    }
  }

  approve.addEventListener("click", () => { void respond(true); });
  deny.addEventListener("click", () => { void respond(false); });
  form.hidden = false;
  status.textContent = "Sign in with your Leedly pilot account.";
}

start().catch(() => {
  status.textContent = "Start the connection again from ChatGPT.";
});
