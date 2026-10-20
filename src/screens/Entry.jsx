import { useState } from 'preact/hooks';
import { supabase, APP_URL, must } from '../lib/supabase.js';
import { AppMark, attempt } from '../components/ui.jsx';

export function Setup() {
  return (
    <div class="center">
      <AppMark />
      <div class="logo">Slices</div>
      <p class="muted" style="max-width:32ch">Falta configurar Supabase: define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY al construir la app.</p>
    </div>
  );
}

export function Login() {
  const [busy, setBusy] = useState(false);
  const go = () => attempt(async () => {
    setBusy(true);
    must(await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: APP_URL() } }));
  }).finally(() => setBusy(false));
  return (
    <main class="center">
      <AppMark size={96} />
      <div class="stack-sm" style="align-items:center">
        <h1 class="logo">Slices</h1>
        <p class="muted">Tu parte de la casa</p>
      </div>
      <button class="btn btn-primario" style="min-width:240px" type="button" onClick={go} disabled={busy}>
        {busy ? 'Abriendo Google…' : 'Entrar con Google'}
      </button>
    </main>
  );
}

export function Onboarding({ houseExists, code, onDone }) {
  const [value, setValue] = useState(code || '');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const claim = (e) => {
    e.preventDefault();
    setBusy(true);
    attempt(async () => { must(await supabase.rpc('claim_invite', { p_code: value })); onDone(); }).finally(() => setBusy(false));
  };
  const create = (e) => {
    e.preventDefault();
    setBusy(true);
    attempt(async () => { must(await supabase.rpc('bootstrap_house', { p_name: name })); onDone(); }).finally(() => setBusy(false));
  };
  const out = () => supabase.auth.signOut();

  return (
    <main class="center">
      <AppMark />
      {!houseExists && !code ? (
        <form class="stack" style="width:100%;max-width:340px;text-align:left" onSubmit={create}>
          <h1 class="titulo">Crear la casa</h1>
          <p class="muted">Eres la primera persona. Quedarás como administrador y podrás invitar al resto.</p>
          <div class="field">
            <label for="nombre">Tu nombre</label>
            <input id="nombre" class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} required autoComplete="given-name" />
          </div>
          <button class="btn btn-primario" type="submit" disabled={busy || !name.trim()}>Crear la casa</button>
          <button class="btn btn-texto" type="button" onClick={out}>Usar otra cuenta</button>
        </form>
      ) : (
        <form class="stack" style="width:100%;max-width:340px;text-align:left" onSubmit={claim}>
          <h1 class="titulo">Unirte a la casa</h1>
          <p class="muted">Escribe el código que te mandó un administrador.</p>
          <div class="field">
            <label for="codigo">Código</label>
            <input id="codigo" class="input" value={value} onInput={(e) => setValue(e.currentTarget.value.toUpperCase())} placeholder="K7M-42Q" required autoCapitalize="characters" style="letter-spacing:0.12em;font-weight:800" />
          </div>
          <button class="btn btn-primario" type="submit" disabled={busy || value.trim().length < 6}>Unirme</button>
          <button class="btn btn-texto" type="button" onClick={out}>Usar otra cuenta</button>
        </form>
      )}
    </main>
  );
}
