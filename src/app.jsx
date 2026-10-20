import { useEffect, useState } from 'preact/hooks';
import { supabase, configured } from './lib/supabase.js';
import { useHouse } from './lib/house.js';
import { applyTheme } from './lib/theme.js';
import { syncSubscription } from './lib/push.js';
import { onUpdate, applyUpdate } from './lib/updates.js';
import { Icon, Toaster } from './components/ui.jsx';
import { Login, Onboarding, Setup } from './screens/Entry.jsx';
import { Today } from './screens/Today.jsx';
import { Profile, AvatarPicker } from './screens/Profile.jsx';
import { Guide } from './screens/Guide.jsx';
import { AdminChores, ChoreEditor } from './screens/AdminChores.jsx';
import { AdminMembers } from './screens/AdminMembers.jsx';

const INVITE_KEY = 'slices-invite';

function useRoute() {
  const read = () => (location.hash.replace(/^#\/?/, '') || 'hoy').split('/');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

function useSession() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

function UpdateBanner() {
  const [v, setV] = useState(null);
  useEffect(() => onUpdate(setV), []);
  if (!v) return null;
  return (
    <div class="update" role="status">
      <span class="grow" style="font-weight:700">Hay una versión nueva de Slices</span>
      <button class="btn" type="button" onClick={applyUpdate}>Actualizar</button>
    </div>
  );
}

function Nav({ route, isAdmin }) {
  const tab = route[0];
  const items = [['hoy', 'Hoy', 'sol'], ...(isAdmin ? [['admin', 'Admin', 'ajustes']] : []), ['perfil', 'Perfil', 'persona']];
  return (
    <nav class="nav" aria-label="Secciones">
      {items.map(([id, label, icon]) => (
        <a href={`#/${id}`} aria-current={tab === id ? 'page' : undefined}><Icon name={icon} />{label}</a>
      ))}
    </nav>
  );
}

export function App() {
  const route = useRoute();
  const session = useSession();
  const h = useHouse(session);

  // Guarda el código de invitación antes del login
  useEffect(() => {
    if (route[0] === 'unirse' && route[1]) {
      try { localStorage.setItem(INVITE_KEY, route[1].toUpperCase()); } catch (e) { /* */ }
    }
  }, [route]);

  // Tema y dispositivo, en cuanto sabemos quién es
  useEffect(() => { if (h.prefs?.theme) applyTheme(h.prefs.theme); }, [h.prefs?.theme]);
  useEffect(() => { if (h.me?.id) syncSubscription(h.me.id).catch(() => {}); }, [h.me?.id]);

  if (!configured) return <Setup />;
  if (session === undefined || (session && h.loading)) {
    return <div class="center"><div class="spinner" aria-label="Cargando" /></div>;
  }
  if (!session) return <><Login /><Toaster /></>;
  if (h.error && !h.me) {
    return <div class="center"><p>{h.error}</p><button class="btn btn-secundario" type="button" onClick={h.reload}>Reintentar</button></div>;
  }
  if (h.notMember) {
    let code = null;
    try { code = localStorage.getItem(INVITE_KEY); } catch (e) { /* */ }
    return <><Onboarding houseExists={h.houseExists} code={code} onDone={() => { try { localStorage.removeItem(INVITE_KEY); } catch (e) { /* */ } location.hash = '#/hoy'; h.reload(); }} /><Toaster /></>;
  }

  const [tab, sub, arg] = route;
  let screen;
  if (tab === 'admin' && h.isAdmin) {
    if (sub === 'miembros') screen = <AdminMembers h={h} />;
    else if (sub === 'tarea') screen = <ChoreEditor h={h} id={arg} />;
    else screen = <AdminChores h={h} />;
  } else if (tab === 'perfil') {
    screen = sub === 'foto' ? <AvatarPicker h={h} /> : <Profile h={h} />;
  } else if (tab === 'guia') {
    screen = <Guide h={h} />;
  } else {
    screen = <Today h={h} />;
  }
  const showNav = !(tab === 'admin' && sub === 'tarea') && tab !== 'guia' && !(tab === 'perfil' && sub === 'foto');
  return (
    <div class="app">
      <UpdateBanner />
      {screen}
      {showNav && <Nav route={route} isAdmin={h.isAdmin} />}
      <Toaster />
    </div>
  );
}
