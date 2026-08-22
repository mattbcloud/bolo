/**
 * Client entry point - Exports the appropriate world type based on URL parameters
 */

import BoloLocalWorld from './world/local';
import BoloNetworkWorld from './world/client';
import { installDiagnostics } from './diagnostics';

// Installed at import time, before any world exists: the failures worth catching include the ones
// that happen during start-up.
installDiagnostics();

// Export the appropriate world type based on URL
const WorldClass =
  location.search === '?local' || location.hostname.split('.')[1] === 'github'
    ? BoloLocalWorld
    : BoloNetworkWorld;

export default WorldClass;
