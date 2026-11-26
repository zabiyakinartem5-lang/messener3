// Runs before React renders, so the saved theme is applied without a flash.
import { loadSettings, applySettings } from './theme.js';

applySettings(loadSettings());
