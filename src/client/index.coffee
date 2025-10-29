BoloLocalWorld   = require './world/local'
BoloNetworkWorld = require './world/client'


## Exports

# Use local mode if explicitly requested with ?local
# Otherwise use network mode
if location.search == '?local'
  module.exports = BoloLocalWorld
else
  module.exports = BoloNetworkWorld
