BoloLocalWorld   = require './world/local'
BoloNetworkWorld = require './world/client'


## Exports

# Use local mode only if explicitly requested with ?local
# Otherwise use network mode (connects to Railway server)
if location.search == '?local'
  module.exports = BoloLocalWorld
else
  module.exports = BoloNetworkWorld
