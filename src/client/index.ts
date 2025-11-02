/**
 * Client entry point - Exports the appropriate world type based on URL parameters
 */

import BoloLocalWorld from './world/local';
import BoloNetworkWorld from './world/client';

// Export the appropriate world type based on URL
const WorldClass =
  location.search === '?local' || location.hostname.split('.')[1] === 'github'
    ? BoloLocalWorld
    : BoloNetworkWorld;

export default WorldClass;
