fs         = require 'fs'
{exec}     = require 'child_process'
browserify = require 'browserify'
require('coffee-script/register')


task 'build:jsbundle', 'Compile the Bolo client JavaScript bundle', (callback) ->
  console.log 'Building client JavaScript bundle...'
  b = browserify('./src/client/index.coffee', {
    basedir: __dirname,
    extensions: ['.coffee', '.js']
  })
  b.transform('coffeeify')

  b.bundle (err, buf) ->
    if err
      console.error 'Build error:', err
      return

    fs.writeFileSync 'js/bolo-bundle.js', buf
    console.log 'Bundle created successfully! Size:', buf.length, 'bytes'

task 'build:manifest', 'Create the manifest file', ->
  dirtytag = Math.round(Math.random() * 10000)
  exec "git describe --always --dirty=-#{dirtytag}", (error, stdout) ->
    throw error if error
    rev = stdout.trim()

    images = ''
    for file in fs.readdirSync 'images/'
      images += "images/#{file}\n" unless file.match /\.gz$/

    sounds = ''
    for file in fs.readdirSync 'sounds/'
      sounds += "sounds/#{file}\n" unless file.match /\.gz$/

    fs.writeFileSync 'bolo.manifest',
      """
        CACHE MANIFEST
        # Version #{rev}

        index.html
        http://ajax.googleapis.com/ajax/libs/jqueryui/1.8.14/themes/base/jquery.ui.all.css
        css/bolo.css
        css/jquery.ui.theme.css
        https://ajax.googleapis.com/ajax/libs/jquery/1.6.2/jquery.min.js
        https://ajax.googleapis.com/ajax/libs/jqueryui/1.8.14/jquery-ui.min.js
        bolo-bundle.js
        http://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png

        #{images}
        #{sounds}
      """

task 'build', 'Compile Bolo', ->
  invoke 'build:jsbundle'
  # FIXME: use applicationCache again.
  #invoke 'build:manifest'
