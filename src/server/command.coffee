fs     = require 'fs'
path   = require 'path'
createBoloApp = require './application'
createBoloIrcClient = null
try
  createBoloIrcClient = require './irc'
catch e
  # IRC module not available

exports.run = ->
  # FIXME: I want YAML, damnit!
  if process.argv.length != 3
    console.log "Usage: bolo-server <config.json>"
    console.log "If the file does not exist, a sample will be created."
    return

  try
    content = fs.readFileSync process.argv[2], 'utf-8'
  catch e
    if e.code != 'ENOENT'
      console.log "I was unable to read that file."
      throw e

    samplefile = path.join(path.dirname(fs.realpathSync(__filename)), '../../config.json.sample')
    sample = fs.readFileSync samplefile, 'utf-8'
    try
      fs.writeFileSync process.argv[2], sample, 'utf-8'
    catch e2
      console.log "Oh snap! I want to create a sample configuration, but can't."
      throw e2
    console.log "I created a sample configuration for you."
    console.log "Please edit the file, then run the same command again."
    return

  try
    config = JSON.parse content
  catch e
    console.log "I don't understand the contents of that file."
    throw e

  # Use PORT environment variable if available (for Railway, Heroku, etc.)
  port = process.env.PORT || config.web.port

  # Update base URL if RAILWAY_PUBLIC_DOMAIN is set
  if process.env.RAILWAY_PUBLIC_DOMAIN
    config.general.base = "https://#{process.env.RAILWAY_PUBLIC_DOMAIN}"

  app = createBoloApp config
  app.listen port
  console.log "Bolo server listening on port #{port}."
  console.log "Base URL: #{config.general.base}"

  if config.irc
    if createBoloIrcClient
      for link, options of config.irc
        app.registerIrcClient createBoloIrcClient(app, options)
    else
      console.log "Warning: IRC configuration found but irc-js module is not available."

  return
