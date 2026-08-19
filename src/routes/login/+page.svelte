<script lang="ts">
  import { onMount } from 'svelte';

  let { data, form }: { data: { githubEnabled: boolean; registered: boolean }; form?: { error?: string; login?: string } } = $props();
  let showPassword = $state(false);
  let loginInput: HTMLInputElement;
  onMount(() => loginInput?.focus());
</script>

<svelte:head><title>Sign in · BullPager</title></svelte:head>

<main class="login-shell">
  <section class="login-card" aria-labelledby="login-title">
    <p class="eyebrow">PRIVATE PROJECT TOOL</p>
    <h1 id="login-title">Sign in</h1>
    <p class="subtitle">Use your project account credentials.</p>
    {#if data.registered}<p class="success" role="status">Account created. You can sign in now.</p>{/if}
    {#if form?.error}<p id="login-error" class="errors" role="alert">{form.error}</p>{/if}
    <form method="POST">
      <label>Login <input bind:this={loginInput} name="login" value={form?.login ?? ''} autocomplete="username" autocapitalize="none" spellcheck="false" required aria-describedby={form?.error ? 'login-error' : undefined} /></label>
      <label>Password <span class="password-control"><input name="password" type={showPassword ? 'text' : 'password'} autocomplete="current-password" required aria-describedby={form?.error ? 'login-error' : undefined} /><button class="password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onclick={() => { showPassword = !showPassword; }}>{showPassword ? 'Hide' : 'Show'}</button></span></label>
      <button type="submit">Continue</button>
    </form>
    {#if data.githubEnabled}<div class="oauth-divider"><span>or</span></div><a class="github-button" href="/auth/github">Continue with GitHub</a>{/if}
    <p class="auth-link"><a href="/register">Create a viewer account</a></p>
  </section>
</main>
