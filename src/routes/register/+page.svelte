<script lang="ts">
  let { form }: { form?: { error?: string; username?: string } } = $props();
</script>

<svelte:head><title>Register · BullPager Board</title></svelte:head>
<main class="login-shell"><section class="login-card"><p class="eyebrow">BULLPAGER</p><h1>Create an account</h1><p class="subtitle">New accounts start with viewer access. An administrator can extend access from Settings.</p>{#if form?.error}<p class="action-errors" role="alert">{form.error}</p>{/if}<form method="POST"><label>Username <input name="username" value={form?.username ?? ''} autocomplete="username" required minlength="3" maxlength="48" /></label><label>Password <input name="password" type="password" autocomplete="new-password" required minlength="8" /></label><label>Confirm password <input name="confirm" type="password" autocomplete="new-password" required minlength="8" /></label><button type="submit">Create viewer account</button></form><p class="auth-link"><a href="/login">Already have an account? Sign in</a></p></section></main>
