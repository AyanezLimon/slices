import { useEffect, useState } from 'preact/hooks';
import { supabase, configured } from './lib/supabase.js';
import { useHouse } from './lib/house.js';
import { applyTheme } from './lib/theme.js';
import { syncSubscription } from './lib/push.js';
import { onUpdate, applyUpdate } from './lib/updates.js';
import { Icon, Toaster, Avatar, AppMark } from './components/ui.jsx';
import { Login, Onboarding, Setup } from './screens/Entry.jsx';
import { Today } from './screens/Today.jsx';
import { Profile, AvatarPicker } from './screens/Profile.jsx';
import { Guide } from './screens/Guide.jsx';
import { AdminChores, ChoreEditor } from './screens/AdminChores.jsx';
import { AdminMembers } from './screens/AdminMembers.jsx';
import { Shopping } from './screens/Shopping.jsx';
import { Week } from './screens/Week.jsx';
import { useShopping } from './lib/shopping.js';

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

// En el celular es la barra de abajo; en una pantalla ancha, la barra lateral (ver styles.css).
// Perfil: en el celular es la pestaña con tu avatar; en la barra lateral, tu nombre al pie.
function Nav({ route, isAdmin, me, hidden, shopCount }) {
  const tab = route[0];
  const items = [['hoy', 'Hoy', 'sol'], ['semana', 'Semana', 'calendario'], ['compras', 'Compras', 'carrito'], ...(isAdmin ? [['admin', 'Admin', 'ajustes']] : [])];
  return (
    <nav class={`nav${hidden ? ' nav-solo-ancha' : ''}`} aria-label="Secciones">
      <div class="nav-marca" aria-hidden="true"><AppMark size={40} /><span>Slices</span></div>
      {items.map(([id, label, icon]) => (
        <a href={`#/${id}`} aria-current={tab === id ? 'page' : undefined}>
          <span class="nav-icono"><Icon name={icon} />{id === 'compras' && shopCount > 0 && <span class="nav-cuenta" aria-hidden="true">{shopCount}</span>}</span>
          {label}
          {id === 'compras' && shopCount > 0 && <span class="sr-only">, {shopCount} por comprar</span>}
        </a>
      ))}
      <a class="nav-yo" href="#/perfil" aria-current={tab === 'perfil' ? 'page' : undefined} aria-label={`Perfil de ${me.name}`}>
        <span class="nav-icono"><Avatar member={me} size={26} /></span>
        <span class="nav-yo-ancha"><Avatar member={me} size={40} /></span>
        <span class="nav-yo-nombre">Perfil</span>
        <span class="nav-yo-ancha tarea" style="font-size:15px">{me.name}</span>
      </a>
    </nav>
  );
}

export function App() {
  const route = useRoute();
  const session = useSession();
  const h = useHouse(session);
  const shop = useShopping(h.me?.id);

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
  } else if (tab === 'semana') {
    screen = <Week h={h} />;
  } else if (tab === 'compras') {
    screen = <Shopping h={h} shop={shop} />;
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
      <Nav route={route} isAdmin={h.isAdmin} me={h.me} hidden={!showNav}
        shopCount={(shop.items || []).filter((x) => !x.owner && !x.bought_at).length} />
      <Toaster />
    </div>
  );
}
