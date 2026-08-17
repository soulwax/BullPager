<script lang="ts">
  let { form }: { form?: { error?: string; login?: string } } = $props();
</script>

<svelte:head><title>Sign in · Project Agile</title></svelte:head>

<main class="login-shell">
  <section class="login-card" aria-labelledby="login-title">
    <p class="eyebrow">PRIVATE PROJECT TOOL</p>
    <h1 id="login-title">Sign in</h1>
    <p class="subtitle">Enter the access credentials supplied for this deployment.</p>
    {#if form?.error}<p class="errors" role="alert">{form.error}</p>{/if}
    <form method="POST">
      <label>Login <input name="login" value={form?.login ?? ''} autocomplete="username" required /></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required /></label>
      <button type="submit">Continue</button>
    </form>
  </section>
</main>
