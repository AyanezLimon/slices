import { useEffect, useState } from 'preact/hooks';
import { isIOS, isStandalone } from './push.js';

const KEY = 'slices-install-dismissed';
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn(deferred));

// Chrome/Android lo dispara una vez; hay que guardarlo antes de que monte la UI.
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
addEventListener('appinstalled', () => { deferred = null; notify(); });

const dismissed = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };

/** null si no hay nada que ofrecer; si no, 'prompt' (Android/escritorio) o 'ios' (instrucciones). */
export function useInstall() {
  const [prompt, setPrompt] = useState(deferred);
  const [hidden, setHidden] = useState(dismissed);
  useEffect(() => { listeners.add(setPrompt); return () => listeners.delete(setPrompt); }, []);

  const kind = hidden || isStandalone() ? null : prompt ? 'prompt' : isIOS() ? 'ios' : null;
  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null;
    notify();
  };
  const dismiss = () => { try { localStorage.setItem(KEY, '1'); } catch (e) { /* */ } setHidden(true); };
  return { kind, install, dismiss };
}
