import { render } from 'preact';
import { App } from './app.jsx';
import { startUpdates } from './lib/updates.js';
import './styles.css';

render(<App />, document.getElementById('app'));
startUpdates();
